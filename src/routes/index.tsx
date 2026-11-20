import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "صنعة SANAA | نظام إدارة مصانع الأثاث" },
      { name: "description", content: "إدارة الطلبات والتصنيع والمخزون والمالية والذكاء الاصطناعي لمصانع الأثاث في مكان واحد." },
      { property: "og:title", content: "صنعة SANAA | نظام إدارة مصانع الأثاث" },
      { property: "og:description", content: "إدارة الطلبات والتصنيع والمخزون والمالية والذكاء الاصطناعي لمصانع الأثاث في مكان واحد." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/$page", params: { page: "dashboard" } });
  },
});
