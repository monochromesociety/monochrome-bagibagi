const { Redis } = require("@upstash/redis");

const redis = Redis.fromEnv();

const QUEUE_KEY = "monochrome:bagi:queue";

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
        getFirst(body, [
            "sender_name",
            "senderName",
            "username",
            "user_name",
            "name",
            "pengirim",
            "donatur",
            "donor"
        ], "Unknown")
    );

    const amountRaw = getFirst(body, [
        "amount",
        "jumlah",
        "nominal",
        "donation",
        "donasi",
        "saweria",
        "value"
    ], 0);

    const message = cleanString(
        getFirst(body, [
            "message",
            "pesan",
            "comment",
            "komentar",
            "note",
            "catatan"
        ], "")
    );

    const transactionId = cleanString(
        getFirst(body, [
            "id",
            "transaction_id",
            "transactionId",
            "donation_id",
            "donationId",
            "trx_id",
            "trxId"
        ], "")
    );

    const amount = Number(
        String(amountRaw).replace(/[^\d.-]/g, "")
    );

    return {
        sender_name: senderName || "Unknown",
        amount: Number.isFinite(amount) ? amount : 0,
        message: message || "",
        transaction_id: transactionId || null,
        received_at: new Date().toISOString()
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

        // BagiBagi mengirim donasi ke sini
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

            await redis.rpush(
                QUEUE_KEY,
                JSON.stringify(donation)
            );

            return res.status(200).json({
                ok: true,
                message: "Donation received",
                donation: donation
            });
        }

        // Roblox mengambil donasi dari sini
        if (req.method === "GET") {

            const donations = [];

            for (let i = 0; i < 50; i++) {

                const item = await redis.lpop(QUEUE_KEY);

                if (!item) {
                    break;
                }

                try {
                    donations.push(
                        typeof item === "string"
                            ? JSON.parse(item)
                            : item
                    );
                } catch (_) {}
            }

            return res.status(200).json(donations);
        }

        return res.status(405).json({
            ok: false,
            error: "method_not_allowed"
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            ok: false,
            error: "server_error",
            message: error.message
        });
    }
}
