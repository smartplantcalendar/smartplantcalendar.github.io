import Link from "next/link";
import { Logo } from "@/components/brand/logo";

const GROUPS = [
  {
    title: "المنصة",
    links: [
      { href: "/crops", label: "دليل المحاصيل" },
      { href: "/planner", label: "مولّد الخطط الزراعية" },
      { href: "/calendar", label: "الرزنامة الزراعية" },
      { href: "/weather", label: "الطقس الزراعي" },
    ],
  },
  {
    title: "حسابي",
    links: [
      { href: "/dashboard", label: "لوحة التحكم" },
      { href: "/tasks", label: "المهام والتذكيرات" },
      { href: "/profile", label: "الملف الشخصي" },
    ],
  },
  {
    title: "عن المنصة",
    links: [
      { href: "/#faq", label: "الأسئلة الشائعة" },
      { href: "/contact", label: "تواصل معنا" },
      { href: "/privacy", label: "سياسة الخصوصية" },
      { href: "/terms", label: "شروط الاستخدام" },
      { href: "/image-credits", label: "مصادر الصور" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-surface pb-20 md:pb-0">
      <div className="container-page grid grid-cols-1 gap-10 py-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-sm text-sm leading-7 text-muted-foreground">
            منصة عربية لتخطيط الزراعة المنزلية والصغيرة في فلسطين وبلاد الشام: مواعيد زراعة حسب منطقتك، ومهام ري وتسميد وحصاد في رزنامة واحدة.
          </p>
          <p className="text-xs leading-6 text-subtle-foreground">
            المعلومات الزراعية في المنصة إرشادية عامة ولا تغني عن استشارة الإرشاد الزراعي المحلي.
          </p>
        </div>
        {GROUPS.map((g) => (
          <nav key={g.title} aria-label={g.title}>
            <h2 className="mb-3 text-sm font-bold text-foreground">{g.title}</h2>
            <ul className="space-y-2">
              {g.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-brand-700">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="container-page flex flex-col gap-2 py-5 text-xs text-subtle-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} رزنامة الزراعة الذكية. جميع الحقوق محفوظة.</p>
          <p>
            بيانات الطقس من{" "}
            <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
              Open-Meteo
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
