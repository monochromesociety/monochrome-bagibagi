export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      message: "Monochrome webhook aktif",
      donations: []
    });
  }

  if (req.method === "POST") {
    let body = req.body || {};

    return res.status(200).json({
      ok: true,
      message: "Webhook menerima data",
      received: body
    });
  }

  return res.status(405).json({
    ok: false,
    error: "method_not_allowed"
  });
}
