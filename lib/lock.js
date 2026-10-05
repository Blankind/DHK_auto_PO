// Lock via Upstash Redis REST. Tanpa env, lock dilewati.
const U = process.env.UPSTASH_REDIS_REST_URL;
const T = process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = "dehikas_create_po";
const cmd = async (...a) =>
  (await (await fetch(U, {
    method: "POST",
    headers: { Authorization: `Bearer ${T}` },
    body: JSON.stringify(a),
  })).json()).result;

export async function acquire() {
  if (!U || !T) return null;
  const id = crypto.randomUUID();
  for (let i = 0; i < 20; i++) {
    if ((await cmd("SET", KEY, id, "NX", "EX", 60)) === "OK") return id;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Sistem sibuk, ada proses pembuatan PO lain. Coba lagi.");
}

export async function release(id) {
  if (!id) return;
  if ((await cmd("GET", KEY)) === id) await cmd("DEL", KEY);
}
