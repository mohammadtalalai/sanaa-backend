from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.ai.embeddings import EmbeddingIndex
from app.ai.language import normalize
from app.core.config import BASE_DIR, settings

logger = logging.getLogger(__name__)
KNOWLEDGE_DIR = BASE_DIR / "knowledge_base"


@dataclass(frozen=True)
class Domain:
    name: str
    file: str
    views: tuple[str, ...]
    keywords: tuple[str, ...]
    rules: tuple[str, ...]  # titles of sections in business_rules.md


DOMAINS: tuple[Domain, ...] = (
    Domain("finance", "finance_schema.md",
           ("v_company_monthly_pnl", "v_branch_monthly_pnl"),
           ("profit", "loss", "p&l", "pnl", "margin", "expense", "cost", "net", "income", "finance",
            "ربح", "ارباح", "أرباح", "خساره", "خسارة", "خسائر", "مصروف", "مصاريف", "تكلفه", "تكلفة", "هامش",
            "صافي", "ماليه", "مالية", "ميزانيه"),
           ("Revenue", "Cost of Goods Sold", "Branch Profit and Loss", "Company Profit and Loss")),
    Domain("sales", "sales_schema.md",
           ("v_sales_lines", "v_monthly_sales", "v_product_performance", "v_orders"),
           ("sale", "sales", "sold", "revenue", "product", "category", "wood", "finish", "order", "quotation",
            "discount", "channel", "rep", "best", "top", "selling", "compare",
            "مبيعات", "مبيع", "بيع", "منتج", "منتجات", "ايراد", "إيراد", "ايرادات", "طلب", "طلبات",
            "عرض سعر", "خصم", "خشب", "تشطيب", "فئه", "فئة", "قارن", "مقارنه", "مقارنة", "اكتر", "أكتر", "أكثر"),
           ("Sales", "Revenue", "Cost of Goods Sold", "Orders and Quotations")),
    Domain("branches", "finance_schema.md",
           ("v_branch_monthly_pnl", "v_monthly_sales"),
           ("branch", "showroom", "factory", "فرع", "فروع", "معرض", "مصنع"),
           ("Branch Profit and Loss",)),
    Domain("inventory", "inventory_schema.md",
           ("v_inventory_status",),
           ("stock", "inventory", "material", "reorder", "warehouse", "مخزون", "خامات", "خامه", "خامة",
            "مخزن", "نواقص"),
           ("Inventory",)),
    Domain("production", "production_schema.md",
           ("v_production_status",),
           ("production", "manufactur", "late", "delay", "stage", "factory", "انتاج", "إنتاج", "تصنيع",
            "متاخر", "متأخر", "مرحله", "مرحلة"),
           ("Production",)),
    Domain("customers", "customer_supplier_schema.md",
           ("v_customer_summary",),
           ("customer", "client", "lifetime", "عميل", "عملاء", "زبون", "زباين"),
           ("Customers",)),
    Domain("suppliers", "customer_supplier_schema.md",
           ("v_supplier_monthly",),
           ("supplier", "vendor", "purchase", "مورد", "موردين", "مشتريات"),
           ("Suppliers",)),
)
DEFAULT_DOMAINS = ("finance", "sales")
ALWAYS_RULES = ("Data Completeness",)


@dataclass(frozen=True)
class Section:
    source: str
    title: str
    body: str

    @property
    def text(self) -> str:
        return f"[{self.source} / {self.title}]\n{self.body.strip()}"


def _split_sections(path: Path) -> list[Section]:
    content = path.read_text(encoding="utf-8")
    matches = list(re.finditer(r"^(#{1,3})\s+(.+)$", content, flags=re.MULTILINE))
    sections: list[Section] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(content)
        body = content[match.end():end].strip()
        if body:
            sections.append(Section(path.name, match.group(2).strip(), body))
    return sections


@lru_cache
def load_sections() -> tuple[Section, ...]:
    sections: list[Section] = []
    for path in sorted(KNOWLEDGE_DIR.glob("*.md")):
        sections.extend(_split_sections(path))
    return tuple(sections)


def detect_domains(question: str) -> list[str]:
    clean = normalize(question)
    scores: dict[str, int] = {}
    for domain in DOMAINS:
        score = sum(1 for word in domain.keywords if normalize(word) in clean)
        if score:
            scores[domain.name] = score
    if not scores:
        return list(DEFAULT_DOMAINS)
    return sorted(scores, key=lambda name: -scores[name])


def _title_matches(title: str, wanted: str) -> bool:
    return re.sub(r"^\d+\.\s*", "", title).strip().lower() == wanted.lower()


class KnowledgeRetriever:
    def __init__(self) -> None:
        self._index = EmbeddingIndex()

    async def retrieve(self, question: str, max_sections: int = 14) -> dict:
        names = detect_domains(question)
        domains = [d for d in DOMAINS if d.name in names]
        sections = load_sections()

        views: list[str] = ["v_as_of"]
        rule_titles: list[str] = []
        files: list[str] = []
        for domain in domains:
            views += [v for v in domain.views if v not in views]
            rule_titles += [r for r in domain.rules if r not in rule_titles]
            if domain.file not in files:
                files.append(domain.file)
        rule_titles += [r for r in ALWAYS_RULES if r not in rule_titles]

        chosen: list[Section] = []
        for view in views:  # view definitions from database_schema.md
            chosen += [s for s in sections if s.source == "database_schema.md" and s.title.endswith(view)]
        chosen += [s for s in sections if s.source == "database_schema.md" and s.title == "SQL Rules"]
        for title in rule_titles:
            chosen += [s for s in sections if s.source == "business_rules.md" and _title_matches(s.title, title)]
        for file in files:
            chosen += [s for s in sections if s.source == file]

        if settings.rag_use_embeddings:
            await self._index.build([s.text for s in sections])
            for index in await self._index.rank(question, top_k=3):
                if sections[index] not in chosen:
                    chosen.append(sections[index])

        unique: list[Section] = []
        for section in chosen:
            if section not in unique:
                unique.append(section)
        unique = unique[:max_sections]
        return {
            "domain": names[0],
            "domains": names,
            "views": views,
            "rules": rule_titles,
            "context": "\n\n".join(s.text for s in unique),
        }


retriever = KnowledgeRetriever()
