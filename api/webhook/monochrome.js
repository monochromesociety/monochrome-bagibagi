import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

async function setupDatabase() {
  await sql`
    CREATE TABLE IF NOT EXISTS donations (
      id BIGSERIAL PRIMARY KEY,
      sender_name TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      message TEXT DEFAULT '',
      transaction_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

function cleanString(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function getFirst(obj, keys, fallback = "") {
  for (const key of keys) {
    if (
      obj &&
      obj[key] !== undefined &&
      obj[key] !== null &&
      obj[key] !== ""
    ) {
      return obj[key];
    }
  }

  return fallback;
}

function normalizeDonation(body) {
  const senderName = cleanString(
    getFirst(
      body,
      [
        "sender_name",
        "senderName",
        "username",
        "user_name",
        "name",
        "pengirim",
        "donatur",
        "donor"
      ],
      "Unknown"
    )
  );

  const amountRaw = getFirst(
    body,
    [
      "amount",
      "jumlah",
      "nominal",
      "donation",
      "donasi",
      "saweria",
      "value"
    ],
    0
  );

  const message = cleanString(
    getFirst(
      body,
      [
        "message",
        "pesan",
        "comment",
        "komentar",
        "note",
        "catatan"
      ],
      ""
    )
  );

  const transactionId = cleanString(
    getFirst(
      body,
      [
        "transaction_id",
        "transactionId",
        "donation_id",
        "donationId",
        "trx_id",
        "trxId"
      ],
      ""
    )
  );

  const amount = Number(
    String(amountRaw).replace(/[^\d.-]/g, "")
  );

  return {
    sender_name: senderName || "Unknown",
    amount: Number.isFinite(amount) ? amount : 0,
    message: message || "",
    transaction_id: transactionId || null
  };
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  let raw = "";

  await new Promise((resolve, reject) => {
    req.on("data", chunk => {
      raw += chunk.toString();
    });

    req.on("end", resolve);
    req.on("error", reject);
  });

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (_) {
    const params = new URLSearchParams(raw);
    return Object.fromEntries(params.entries());
  }
}

export default async function handler(req, res) {
  try {

    await setupDatabase();

    /*
     * BagiBagi -> Vercel
     */
    if (req.method === "POST") {

      const body = await readBody(req);

      const donation = normalizeDonation(body);

      if (donation.amount <= 0) {
        return res.status(400).json({
          ok: false,
          error: "invalid_amount",
          received: body
        });
      }

      /*
       * Cegah transaksi yang sama masuk dua kali
       */
      if (donation.transaction_id) {

        const existing = await sql`
          SELECT id
          FROM donations
          WHERE transaction_id = ${donation.transaction_id}
          LIMIT 1
        `;

        if (existing.length > 0) {
          return res.status(200).json({
            ok: true,
            duplicate: true
          });
        }
      }

      await sql`
        INSERT INTO donations
        (
          sender_name,
          amount,
          message,
          transaction_id
        )
        VALUES
        (
          ${donation.sender_name},
          ${donation.amount},
          ${donation.message},
          ${donation.transaction_id}
        )
      `;

      return res.status(200).json({
        ok: true,
        message: "Donation received",
        donation
      });
    }

    /*
     * Roblox -> Vercel
     */
    if (req.method === "GET") {

      /*
       * Ambil donasi paling lama terlebih dahulu.
       */
      const donations = await sql`
        SELECT
          id,
          sender_name,
          amount,
          message,
          transaction_id
        FROM donations
        ORDER BY id ASC
        LIMIT 50
      `;

      /*
       * Hapus donasi setelah diberikan ke Roblox.
       */
      if (donations.length > 0) {

        const ids = donations.map(d => d.id);

        await sql`
          DELETE FROM donations
          WHERE id = ANY(${ids})
        `;
      }

      return res.status(200).json(donations);
    }

    return res.status(405).json({
      ok: false,
      error: "method_not_allowed"
    });

  } catch (error) {

    console.error("WEBHOOK ERROR:", error);

    return res.status(500).json({
      ok: false,
      error: "server_error",
      message: error.message
    });
  }
}
