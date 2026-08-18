from __future__ import annotations

import re
import subprocess
from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


def replace_count(
    text: str,
    old: str,
    new: str,
    expected: int,
    label: str,
) -> str:
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{label}: expected {expected} matches, found {count}")
    return text.replace(old, new)


def replace_regex_once(
    text: str,
    pattern: str,
    replacement: str,
    label: str,
) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.DOTALL)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 regex match, found {count}")
    return updated


# 1) Keep 6' × 3' visually recommended, but never auto-click it.
path = "src/components/design/layout/ConfigCard.tsx"
text = read(path)
text = replace_once(
    text,
    "  const appliedBannerDefaultRef = useRef(false);\n",
    "",
    "ConfigCard applied default ref",
)
recommended_block = """    // Recommendation styling is visual only. It must not mutate dimensions,
    // pricing state, or the selected preset.
    popularButton.classList.add(
      'relative',
      "before:content-['MOST_POPULAR']",
      'before:absolute',
      'before:-top-2.5',
      'before:left-1/2',
      'before:-translate-x-1/2',
      'before:whitespace-nowrap',
      'before:rounded-full',
      'before:bg-orange-500',
      'before:px-1.5',
      'before:py-0.5',
      'before:text-[9px]',
      'before:font-bold',
      'before:leading-none',
      'before:text-white',
      'before:shadow-sm',
      'before:z-10',
      'ring-1',
      'ring-orange-200',
    );
    popularButton.dataset.recommended = 'true';
    popularButton.setAttribute(
      'aria-label',
      `${(popularButton.textContent || "6' × 3'").trim()} — Most popular`,
    );
    popularButton.style.borderColor = '#f97316';
    popularButton.style.backgroundColor = '#fff7ed';
    popularButton.style.color = '#c2410c';
"""
text = replace_regex_once(
    text,
    r"    // Keep the badge purely visual.*?    popularButton\.click\(\);\n",
    recommended_block,
    "ConfigCard automatic default-selection block",
)
if "popularButton.click()" in text:
    raise SystemExit("ConfigCard still contains the automatic popular-size click")
write(path, text)


# 2) Return a real zero total for missing dimensions. Valid configured banners
# retain the existing minimum-price and add-on rules.
path = "src/lib/bannerPricingEngine.ts"
text = read(path)
text = replace_once(
    text,
    """  const areaSqFt = calculateBannerAreaSqFt(safeWidthIn, safeHeightIn);
  const materialRate = MATERIAL_PRICE_MAP[material] ?? MATERIAL_PRICE_MAP['13oz'];
  const unitBasePriceCents = Math.max(MINIMUM_UNIT_PRICE_CENTS, Math.round(areaSqFt * materialRate * 100));
  const baseBannerPriceCents = unitBasePriceCents * safeQuantity;

  const ropeLinearFeet = addRope ? getRopeLinearFeet(safeWidthIn, safeHeightIn, ropePlacement) : 0;
""",
    """  const hasConfiguredSize = safeWidthIn > 0 && safeHeightIn > 0;
  const areaSqFt = calculateBannerAreaSqFt(safeWidthIn, safeHeightIn);
  const materialRate = MATERIAL_PRICE_MAP[material] ?? MATERIAL_PRICE_MAP['13oz'];
  const unitBasePriceCents = hasConfiguredSize
    ? Math.max(MINIMUM_UNIT_PRICE_CENTS, Math.round(areaSqFt * materialRate * 100))
    : 0;
  const baseBannerPriceCents = unitBasePriceCents * safeQuantity;

  const ropeLinearFeet = hasConfiguredSize && addRope
    ? getRopeLinearFeet(safeWidthIn, safeHeightIn, ropePlacement)
    : 0;
""",
    "bannerPricingEngine configured-size gate",
)
text = replace_once(
    text,
    "  const polePocketLinearFeet = getPolePocketLinearFeet(safeWidthIn, safeHeightIn, polePockets);\n",
    """  const polePocketLinearFeet = hasConfiguredSize
    ? getPolePocketLinearFeet(safeWidthIn, safeHeightIn, polePockets)
    : 0;
""",
    "bannerPricingEngine pole-pocket gate",
)
write(path, text)


# 3) Add regression coverage for the zero state and the recommended size.
path = "src/lib/__tests__/bannerPricingEngine.test.ts"
text = read(path)
test_addition = r"""
  it('returns zero until both banner dimensions are configured', () => {
    for (const [widthIn, heightIn] of [[0, 0], [72, 0], [0, 36]]) {
      const result = calculateBannerPricing({
        widthIn,
        heightIn,
        quantity: 1,
        material: '13oz',
        grommets: 'none',
        polePockets: 'left',
        addRope: true,
      });

      expect(result.unitBasePriceCents).toBe(0);
      expect(result.baseBannerPriceCents).toBe(0);
      expect(result.ropeCostCents).toBe(0);
      expect(result.polePocketCostCents).toBe(0);
      expect(result.subtotalBeforeDiscountCents).toBe(0);
      expect(result.taxCents).toBe(0);
      expect(result.totalCents).toBe(0);
    }
  });

  it("preserves the existing 6' × 3' price after the customer selects it", () => {
    const result = calculateBannerPricing({
      widthIn: 72,
      heightIn: 36,
      quantity: 1,
      material: '13oz',
      grommets: 'none',
      polePockets: 'none',
      addRope: false,
    });

    expect(result.baseBannerPriceCents).toBe(8100);
    expect(result.subtotalCents).toBe(8100);
    expect(result.taxCents).toBe(486);
    expect(result.totalCents).toBe(8586);
  });
"""
if not text.endswith("});\n"):
    raise SystemExit("banner pricing test file has an unexpected ending")
text = text[:-4] + test_addition + "\n});\n"
write(path, text)


def patch_page(path: str, *, is_design: bool) -> None:
    text = read(path)

    text = replace_once(
        text,
        "  const [activePreset, setActivePreset] = useState<number | null>(0);",
        "  const [activePreset, setActivePreset] = useState<number | null>(null);",
        f"{path} initial selected preset",
    )

    if is_design:
        text = replace_once(
            text,
            """  const { wrapperStyle: dimPreviewWrapperStyle, paddingPct: dimPreviewPaddingPct } = useMemo(
    () => getPreviewContainerStyles(isLgScreen ? 200 : 140),
    [getPreviewContainerStyles, isLgScreen]
  );
  const bannerPricing = calculateBannerPricing({
    widthIn,
    heightIn,
""",
            """  const { wrapperStyle: dimPreviewWrapperStyle, paddingPct: dimPreviewPaddingPct } = useMemo(
    () => getPreviewContainerStyles(isLgScreen ? 200 : 140),
    [getPreviewContainerStyles, isLgScreen]
  );
  const hasCommittedBannerSize =
    isYardSign || isCarMagnet || (hasConfirmedSize && widthIn > 0 && heightIn > 0);
  const pricingWidthIn = hasCommittedBannerSize ? widthIn : 0;
  const pricingHeightIn = hasCommittedBannerSize ? heightIn : 0;
  const bannerPricing = calculateBannerPricing({
    widthIn: pricingWidthIn,
    heightIn: pricingHeightIn,
""",
            f"{path} committed-size pricing gate",
        )
        text = replace_once(
            text,
            """  const totals = calcTotals({
    widthIn,
    heightIn,
""",
            """  const totals = calcTotals({
    widthIn: pricingWidthIn,
    heightIn: pricingHeightIn,
""",
            f"{path} calcTotals committed-size gate",
        )
    else:
        text = replace_once(
            text,
            """  const { wrapperStyle: dimPreviewWrapperStyle, paddingPct: dimPreviewPaddingPct } = useMemo(() => getPreviewContainerStyles(isLgScreen ? 200 : 140), [getPreviewContainerStyles, isLgScreen]);
  const totals = calcTotals({
    widthIn,
    heightIn,
""",
            """  const { wrapperStyle: dimPreviewWrapperStyle, paddingPct: dimPreviewPaddingPct } = useMemo(() => getPreviewContainerStyles(isLgScreen ? 200 : 140), [getPreviewContainerStyles, isLgScreen]);
  const hasCommittedBannerSize =
    isYardSign || isCarMagnet || (hasConfirmedSize && widthIn > 0 && heightIn > 0);
  const pricingWidthIn = hasCommittedBannerSize ? widthIn : 0;
  const pricingHeightIn = hasCommittedBannerSize ? heightIn : 0;
  const totals = calcTotals({
    widthIn: pricingWidthIn,
    heightIn: pricingHeightIn,
""",
            f"{path} committed-size pricing gate",
        )
        text = replace_once(
            text,
            """  const bannerPricing = calculateBannerPricing({
    widthIn,
    heightIn,
""",
            """  const bannerPricing = calculateBannerPricing({
    widthIn: pricingWidthIn,
    heightIn: pricingHeightIn,
""",
            f"{path} banner engine committed-size gate",
        )

    # All cart/checkout/modal actions converge here. This guard protects
    # against DOM manipulation or a future button-state regression.
    text = replace_once(
        text,
        """  ): Promise<void> => {
    if (actionPreparationRef.current) return actionPreparationRef.current;
""",
        """  ): Promise<void> => {
    if (!isYardSign && !isCarMagnet && !hasCommittedBannerSize) {
      toast({
        title: 'Choose a banner size',
        description: 'Select a standard size or enter custom dimensions before continuing.',
        variant: 'destructive',
      });
      return Promise.resolve();
    }
    if (actionPreparationRef.current) return actionPreparationRef.current;
""",
        f"{path} zero-price cart guard",
    )

    if is_design:
        text = replace_once(
            text,
            "  }, [finishingType, heightIn, isCarMagnet, performCheckout, prepareCurrentPlacementPreview, productType, toast, widthIn]);",
            "  }, [finishingType, hasCommittedBannerSize, heightIn, isCarMagnet, isYardSign, performCheckout, prepareCurrentPlacementPreview, productType, toast, widthIn]);",
            f"{path} cart guard dependencies",
        )
    else:
        text = replace_once(
            text,
            "  }, [finishingType, hasReviewedOptions, heightIn, isCarMagnet, performCheckout, prepareCurrentPlacementPreview, productType, toast, widthIn]);",
            "  }, [finishingType, hasCommittedBannerSize, hasReviewedOptions, heightIn, isCarMagnet, isYardSign, performCheckout, prepareCurrentPlacementPreview, productType, toast, widthIn]);",
            f"{path} cart guard dependencies",
        )

    text = replace_count(
        text,
        "disabled={!uploadedFile || isUploading || isProcessingUpsell}",
        "disabled={!uploadedFile || !hasCommittedBannerSize || isUploading || isProcessingUpsell}",
        2,
        f"{path} disabled primary actions",
    )
    text = replace_count(
        text,
        "uploadedFile && !isUploading && !isProcessingUpsell",
        "uploadedFile && hasCommittedBannerSize && !isUploading && !isProcessingUpsell",
        2,
        f"{path} enabled primary-action styling",
    )

    ai_guard_count = text.count("disabled={!widthIn || !heightIn || !material || isUploading}")
    if ai_guard_count not in (1, 2):
        raise SystemExit(
            f"{path} AI size guards: expected 1 or 2 matches, found {ai_guard_count}"
        )
    text = text.replace(
        "disabled={!widthIn || !heightIn || !material || isUploading}",
        "disabled={!hasCommittedBannerSize || !material || isUploading}",
    )

    text = replace_once(
        text,
        "if (!widthIn || !heightIn) missing.push('size');",
        "if (!hasCommittedBannerSize) missing.push('size');",
        f"{path} upload helper committed-size state",
    )

    write(path, text)


patch_page("src/pages/Design.tsx", is_design=True)
patch_page("src/pages/GoogleAdsBanner.tsx", is_design=False)


# 5) /design should use the existing destination-tax mode already proven on
# /google-ads-banner. Checkout, payment, and server-side tax files are untouched.
path = "src/pages/Design.tsx"
text = read(path)

text = replace_once(
    text,
    """                    sameDayHitServiceCents={previewSameDayFeeCents}
                  />
""",
    """                    sameDayHitServiceCents={previewSameDayFeeCents}
                    taxCalculatedAtCheckout
                  />
""",
    "Design yard-sign pre-tax display",
)
text = replace_once(
    text,
    """                  taxCents={carMagnetPricing.taxCents}
                  taxRate={0.06}
                  adjustedSubtotalCents={carMagnetPricing.subtotalCents}
                  totalCents={carMagnetPricing.totalCents + previewSameDayFeeCents}
                  footerNote="Tax calculated at checkout"
""",
    """                  taxCents={0}
                  taxRate={0.06}
                  adjustedSubtotalCents={carMagnetPricing.subtotalCents}
                  totalCents={carMagnetPricing.subtotalCents + previewSameDayFeeCents}
                  taxCalculatedAtCheckout
                  footerNote="Destination-based tax calculated at checkout"
""",
    "Design car-magnet pre-tax display",
)
text = replace_once(
    text,
    """                  taxCents={bannerTaxAfterAllDiscountsCents}
                  taxRate={0.06}
                  adjustedSubtotalCents={bannerSubtotalAfterAllDiscountsCents}
                  totalCents={bannerTotalAfterAllDiscountsCents + previewSameDayFeeCents}
""",
    """                  taxCents={0}
                  taxRate={0.06}
                  adjustedSubtotalCents={bannerSubtotalAfterAllDiscountsCents}
                  totalCents={bannerSubtotalAfterAllDiscountsCents + previewSameDayFeeCents}
                  taxCalculatedAtCheckout
""",
    "Design banner pre-tax display",
)
text = replace_once(
    text,
    '                  footerNote="Tax calculated at checkout"',
    '                  footerNote="Destination-based tax calculated at checkout"',
    "Design banner footer note",
)
text = replace_once(
    text,
    """  const bannerTaxAfterAllDiscountsCents = Math.round(bannerSubtotalAfterAllDiscountsCents * 0.06);
  const bannerTotalAfterAllDiscountsCents = bannerSubtotalAfterAllDiscountsCents + bannerTaxAfterAllDiscountsCents;
""",
    "",
    "Design obsolete pre-checkout tax math",
)
write(path, text)


expected_files = {
    "src/components/design/layout/ConfigCard.tsx",
    "src/lib/bannerPricingEngine.ts",
    "src/lib/__tests__/bannerPricingEngine.test.ts",
    "src/pages/Design.tsx",
    "src/pages/GoogleAdsBanner.tsx",
}
changed = set(
    subprocess.check_output(["git", "diff", "--name-only"], text=True).splitlines()
)
if changed != expected_files:
    raise SystemExit(
        f"Unexpected changed files. Expected {sorted(expected_files)}, got {sorted(changed)}"
    )

design = read("src/pages/Design.tsx")
google = read("src/pages/GoogleAdsBanner.tsx")
config = read("src/components/design/layout/ConfigCard.tsx")
if "popularButton.click()" in config:
    raise SystemExit("Automatic recommended-size click still present")
if design.count("taxCalculatedAtCheckout") < 3:
    raise SystemExit("/design does not consistently defer destination tax")
if google.count("taxCalculatedAtCheckout") < 3:
    raise SystemExit("/google-ads-banner lost its destination-tax behavior")
if "useState<number | null>(0)" in design or "useState<number | null>(0)" in google:
    raise SystemExit("A preset is still selected on initial load")
