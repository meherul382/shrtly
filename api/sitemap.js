const urls = [
  "https://shrtigo.xyz/",
  "https://shrtigo.xyz/url-shortener.html",
  "https://shrtigo.xyz/simple-shortener.html",
  "https://shrtigo.xyz/guides.html",
  "https://shrtigo.xyz/about.html",
  "https://shrtigo.xyz/privacy.html",
  "https://shrtigo.xyz/terms.html",
  "https://shrtigo.xyz/contact.html",
  "https://shrtigo.xyz/disclaimer.html",
  "https://shrtigo.xyz/guides/what-is-a-short-link.html",
  "https://shrtigo.xyz/guides/what-is-a-url-shortener.html",
  "https://shrtigo.xyz/guides/how-to-shorten-a-url.html",
  "https://shrtigo.xyz/guides/short-links-for-social-media.html",
  "https://shrtigo.xyz/guides/url-shortener-vs-long-url.html",
  "https://shrtigo.xyz/guides/custom-short-url.html",
  "https://shrtigo.xyz/guides/benefits-of-short-links.html",
  "https://shrtigo.xyz/guides/how-url-shorteners-work.html",
  "https://shrtigo.xyz/guides/are-url-shorteners-safe.html",
  "https://shrtigo.xyz/guides/shorten-links-for-facebook.html",
  "https://shrtigo.xyz/guides/youtube-short-link.html",
  "https://shrtigo.xyz/guides/custom-url-alias.html",
  "https://shrtigo.xyz/guides/short-links-digital-marketing.html",
  "https://shrtigo.xyz/guides/short-links-email-marketing.html",
  "https://shrtigo.xyz/guides/short-urls-small-business.html",
  "https://shrtigo.xyz/guides/how-to-choose-url-shortener.html",
  "https://shrtigo.xyz/guides/short-links-vs-qr-codes.html",
  "https://shrtigo.xyz/guides/professional-short-links.html",
  "https://shrtigo.xyz/guides/common-url-shortener-mistakes.html",
  "https://shrtigo.xyz/guides/mobile-short-links.html",
  "https://shrtigo.xyz/guides/complete-short-url-guide.html",
  "https://shrtigo.xyz/guides/free-url-shortener.html",
  "https://shrtigo.xyz/guides/shorten-url-for-instagram.html",
  "https://shrtigo.xyz/guides/shorten-url-for-whatsapp.html",
  "https://shrtigo.xyz/guides/how-to-shorten-url-android.html",
  "https://shrtigo.xyz/guides/how-to-shorten-url-iphone.html",
  "https://shrtigo.xyz/guides/how-to-shorten-google-drive-link.html",
  "https://shrtigo.xyz/guides/how-to-shorten-google-docs-link.html",
  "https://shrtigo.xyz/guides/short-link-for-tiktok.html",
  "https://shrtigo.xyz/guides/short-link-instagram-bio.html",
  "https://shrtigo.xyz/guides/short-url-for-facebook-page.html",
  "https://shrtigo.xyz/guides/short-url-for-linkedin.html",
  "https://shrtigo.xyz/guides/short-url-for-whatsapp-business.html",
  "https://shrtigo.xyz/guides/short-url-for-qr-codes.html",
  "https://shrtigo.xyz/guides/url-shortener-affiliate-marketing.html",
  "https://shrtigo.xyz/guides/url-shortener-for-marketers.html",
  "https://shrtigo.xyz/guides/url-shortener-for-bloggers.html",
  "https://shrtigo.xyz/guides/url-shortener-for-students.html",
  "https://shrtigo.xyz/guides/short-url-best-practices.html",
  "https://shrtigo.xyz/guides/short-url-safety-checklist.html",
  "https://shrtigo.xyz/guides/why-short-url-not-working.html",
  "https://shrtigo.xyz/guides/how-long-do-short-urls-last.html",
  "https://shrtigo.xyz/guides/can-you-track-short-links.html",
  "https://shrtigo.xyz/guides/short-url-vs-direct-url.html",
  "https://shrtigo.xyz/guides/best-free-url-shorteners.html",
  "https://shrtigo.xyz/guides/how-to-make-short-link-for-website.html",
  "https://shrtigo.xyz/guides/short-link-email.html",
  "https://shrtigo.xyz/guides/short-url-for-small-business.html"
];

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).send('Method Not Allowed');
  }

  const lastmod = new Date().toISOString().slice(0, 10);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((url) => `  <url><loc>${url}</loc><lastmod>${lastmod}</lastmod></url>`).join("\n") +
    `\n</urlset>\n`;

  res.status(200);
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(req.method === 'HEAD' ? '' : xml);
}
