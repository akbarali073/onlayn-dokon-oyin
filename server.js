const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const cors = require("cors");

const Room = require("./models/Room");
const User = require("./models/User");
const Product = require("./models/Product");
const Purchase = require("./models/Purchase");

const PORT = process.env.PORT || 3000;
const MONGO =
  process.env.MONGO_URI ||
  "mongodb+srv://1winakg_db_user:25YhJQ9qzu1YigP0@cluster0.mrgxoio.mongodb.net";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 4e6 }); // rasm (base64) uchun

app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // CORS sozlamasi
app.use(
  cors({
    origin: "http://127.0.0.1:5500",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
const page = (f) => (req, res) =>
  res.sendFile(path.join(__dirname, "public", f));
app.get("/r/:code", page("play.html"));
app.get("/admin/:code", page("admin.html"));

/* ---------- yordamchilar ---------- */
const clean = (s, n) =>
  String(s ?? "")
    .trim()
    .slice(0, n);
const token = () => crypto.randomBytes(16).toString("hex");
const fail = (m) => {
  throw Object.assign(new Error(m), { user: true });
};
const same = (a, b) => {
  const x = Buffer.from(String(a)),
    y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const pubProduct = (p) => ({
  id: String(p._id),
  sellerId: String(p.seller),
  sellerName: p.sellerName,
  name: p.name,
  image: p.image,
  price: p.price,
  description: p.description,
  sold: p.sold,
  createdAt: p.createdAt,
});
const pubPurchase = (p) => ({
  id: String(p._id),
  buyerId: String(p.buyer),
  buyerName: p.buyerName,
  sellerId: String(p.seller),
  sellerName: p.sellerName,
  productId: String(p.product),
  productName: p.productName,
  qty: p.qty,
  total: p.total,
  createdAt: p.createdAt,
});

// Qatnashchilar jarayoni va yakunlash sharti
async function progress(roomId) {
  const [users, makers, buyers] = await Promise.all([
    User.find({ room: roomId }).lean(),
    Product.distinct("seller", { room: roomId }),
    Purchase.distinct("buyer", { room: roomId }),
  ]);
  const made = new Set(makers.map(String)),
    bought = new Set(buyers.map(String));
  const list = users.map((u) => ({
    id: String(u._id),
    name: u.name,
    hasProduct: made.has(String(u._id)),
    hasBought: bought.has(String(u._id)),
  }));
  const boughtCount = list.filter((u) => u.hasBought).length;
  return {
    users: list,
    total: list.length,
    boughtCount,
    ready: list.length >= 2 && boughtCount === list.length,
  };
}

async function fullState(room) {
  const [products, purchases, prog] = await Promise.all([
    Product.find({ room: room._id }).sort({ createdAt: -1 }).lean(),
    Purchase.find({ room: room._id }).sort({ createdAt: -1 }).limit(300).lean(),
    progress(room._id),
  ]);
  return {
    room: { code: room.code, title: room.title, status: room.status },
    products: products.map(pubProduct),
    purchases: purchases.map(pubPurchase),
    progress: prog,
  };
}
const pushProgress = async (room) =>
  io.to(room.code).emit("progress", await progress(room._id));

/* ---------- REST ---------- */
app.post("/api/rooms", async (req, res) => {
  try {
    const title = clean(req.body.title, 80);
    if (title.length < 2)
      return res.status(400).json({ error: "Oʻyin nomini kiriting" });
    let code;
    do {
      code = crypto.randomBytes(4).toString("hex").slice(0, 5).toUpperCase();
    } while (await Room.exists({ code }));
    const adminToken = token();
    await Room.create({ code, title, adminToken });
    res.json({ code, adminToken });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server xatosi" });
  }
});

app.get("/api/rooms/:code", async (req, res) => {
  const room = await Room.findOne({
    code: clean(req.params.code, 10).toUpperCase(),
  }).lean();
  if (!room) return res.status(404).json({ error: "Xona topilmadi" });
  res.json({ code: room.code, title: room.title, status: room.status });
});

/* ---------- Socket.io ---------- */
const handle = (socket, ev, fn) =>
  socket.on(ev, async (data, ack) => {
    ack = typeof ack === "function" ? ack : () => {};
    try {
      ack(await fn(data || {}));
    } catch (e) {
      if (!e.user) console.error(ev, e);
      ack({
        ok: false,
        error: e.user
          ? e.message
          : e.code === 11000
            ? "Bu ism xonada band"
            : "Server xatosi",
      });
    }
  });

async function playerCtx(socket, needActive = true) {
  const { role, roomId, userId } = socket.data;
  if (role !== "player") fail("Avval xonaga qoʻshiling");
  const [room, user] = await Promise.all([
    Room.findById(roomId),
    User.findById(userId),
  ]);
  if (!room || !user) fail("Sessiya topilmadi");
  if (needActive && room.status !== "active") fail("Oʻyin yakunlangan");
  return { room, user };
}

const validImage = (s) => {
  s = String(s || "").trim();
  if (/^https?:\/\/\S{3,500}$/i.test(s)) return s;
  if (
    /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s) &&
    s.length < 2.5e6
  )
    return s;
  return "";
};

io.on("connection", (socket) => {
  // O'quvchi xonaga qo'shiladi (token bilan qayta ulanish ham shu yerda)
  handle(socket, "player:join", async ({ code, name, token: tk }) => {
    const room = await Room.findOne({ code: clean(code, 10).toUpperCase() });
    if (!room) fail("Xona topilmadi");
    let user = tk
      ? await User.findOne({ room: room._id, token: String(tk) }).select(
          "+token",
        )
      : null;
    let created = false;
    if (!user) {
      name = clean(name, 40);
      if (name.length < 2) fail("NAME");
      if (room.status !== "active") fail("Oʻyin yakunlangan");
      user = await User.create({ room: room._id, name, token: token() });
      created = true;
    }
    socket.data = {
      role: "player",
      roomId: room._id,
      userId: user._id,
      code: room.code,
    };
    socket.join(room.code);
    if (created) await pushProgress(room);
    return {
      ok: true,
      me: { id: String(user._id), name: user.name, token: user.token },
      state: await fullState(room),
    };
  });

  // Mahsulot (e'lon) yaratish
  handle(socket, "product:create", async (d) => {
    const { room, user } = await playerCtx(socket);
    const name = clean(d.name, 80),
      price = Math.round(Number(d.price));
    if (name.length < 2) fail("Mahsulot nomini kiriting");
    if (!(price >= 1 && price <= 1e10)) fail("Narx notoʻgʻri");
    if (
      (await Product.countDocuments({ room: room._id, seller: user._id })) >= 5
    )
      fail("Eng koʻp 5 ta eʼlon yaratish mumkin");
    const p = await Product.create({
      room: room._id,
      seller: user._id,
      sellerName: user.name,
      name,
      price,
      description: clean(d.description, 500),
      image: validImage(d.image),
    });
    io.to(room.code).emit("product:new", pubProduct(p));
    await pushProgress(room);
    return { ok: true };
  });

  // Sotib olish
  handle(socket, "product:buy", async ({ productId, qty }) => {
    const { room, user } = await playerCtx(socket);
    qty = Math.floor(Number(qty));
    if (!(qty >= 1 && qty <= 100))
      fail("Miqdor 1 dan 100 gacha boʻlishi kerak");
    if (!mongoose.isValidObjectId(productId)) fail("Mahsulot topilmadi");
    const product = await Product.findOneAndUpdate(
      { _id: productId, room: room._id, seller: { $ne: user._id } },
      { $inc: { sold: qty } },
      { new: true },
    );
    if (!product) fail("Mahsulot topilmadi yoki oʻzingizning mahsulotingiz");
    const purchase = await Purchase.create({
      room: room._id,
      buyer: user._id,
      buyerName: user.name,
      seller: product.seller,
      sellerName: product.sellerName,
      product: product._id,
      productName: product.name,
      qty,
      total: qty * product.price,
    });
    io.to(room.code).emit("purchase:new", pubPurchase(purchase));
    io.to(room.code).emit("product:updated", pubProduct(product));
    await pushProgress(room);
    return { ok: true };
  });

  // Admin ulanishi
  handle(socket, "admin:join", async ({ code, adminToken }) => {
    const room = await Room.findOne({
      code: clean(code, 10).toUpperCase(),
    }).select("+adminToken");
    if (!room || !same(room.adminToken, adminToken || ""))
      fail("Admin kaliti notoʻgʻri");
    socket.data = { role: "admin", roomId: room._id, code: room.code };
    socket.join(room.code);
    return { ok: true, state: await fullState(room) };
  });

  // Admin o'yinni yakunlaydi (faqat shart bajarilganda)
  handle(socket, "admin:finish", async () => {
    if (socket.data.role !== "admin") fail("Ruxsat yoʻq");
    const room = await Room.findById(socket.data.roomId);
    if (room.status === "finished") return { ok: true };
    if (!(await progress(room._id)).ready)
      fail("Hamma kamida 1 ta xarid qilmagan");
    room.status = "finished";
    await room.save();
    io.to(room.code).emit("room:finished");
    return { ok: true };
  });
});

mongoose
  .connect(MONGO)
  .then(() =>
    server.listen(PORT, () => console.log(`http://localhost:${PORT}`)),
  )
  .catch((e) => {
    console.error("MongoDB ulanmadi:", e.message);
    process.exit(1);
  });
