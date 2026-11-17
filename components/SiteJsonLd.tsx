import { site, siteUrl } from "@/lib/site";

export function SiteJsonLd() {
  const url = siteUrl();
  const payload = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: site.name,
        description: site.description,
        url,
        inLanguage: "en",
      },
      {
        "@type": "WebApplication",
        name: site.name,
        description: site.description,
        url,
        applicationCategory: "CommunicationApplication",
        operatingSystem: "Web",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
      },
      {
        "@type": "Organization",
        name: site.name,
        url,
        logo: `${url}/app-icon-512.png`,
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
    />
  );
}