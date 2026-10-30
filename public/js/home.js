const $ = (s) => document.querySelector(s);

$("#createForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector("button");
  btn.disabled = true;
  try {
    const r = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: $("#title").value }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    localStorage.setItem("market_admin_" + d.code, d.adminToken);
    location.href = "/admin/" + d.code;
  } catch (err) {
    $("#createErr").textContent = err.message;
    btn.disabled = false;
  }
});

$("#joinForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = $("#code").value.trim().toUpperCase();
  const r = await fetch("/api/rooms/" + encodeURIComponent(code));
  if (r.ok) location.href = "/r/" + code;
  else $("#joinErr").textContent = "Bunday xona topilmadi";
});
