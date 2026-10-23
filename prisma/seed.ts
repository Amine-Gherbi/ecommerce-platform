import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";

import { shippingForSubtotal } from "../src/lib/money";

const prisma = new PrismaClient();

// Fixed epoch for deterministic seed ids. The catalog is rebuilt from scratch
// on every run; stable ids make screenshots and links reproducible.
const UUID_EPOCH_MS = 1_767_225_600_000n;

function deterministicUuid7(seq: number, salt: string): string {
  const timestamp = (UUID_EPOCH_MS + BigInt(seq)).toString(16).padStart(12, "0");
  const digest = createHash("sha256").update(salt).digest("hex");
  const randA = digest.slice(0, 3);
  const variantNibble = ((parseInt(digest[3] ?? "0", 16) & 0x3) | 0x8).toString(16);
  const randB = digest.slice(4, 19);
  const hex = `${timestamp}7${randA}${variantNibble}${randB}`;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function parseSeed(argv: string[]): number {
  const inline = argv.find((argument) => argument.startsWith("--seed="));
  if (inline !== undefined) {
    return Number(inline.slice("--seed=".length));
  }
  const flagIndex = argv.indexOf("--seed");
  if (flagIndex !== -1) {
    return Number(argv[flagIndex + 1] ?? "42");
  }
  return 42;
}

interface CategorySeed {
  slug: string;
  name: string;
  position: number;
}

interface BrandSeed {
  slug: string;
  name: string;
}

interface VariantSeed {
  title: string;
  priceCents: number;
  stock: number;
}

interface ProductSeed {
  slug: string;
  skuBase: string;
  file: string;
  alt: string;
  title: string;
  brandSlug: string;
  categorySlug: string;
  description: string;
  specs: Record<string, string>;
  variants: VariantSeed[];
}

const CATEGORIES: CategorySeed[] = [
  { slug: "headphones", name: "Headphones", position: 0 },
  { slug: "speakers", name: "Speakers", position: 1 },
  { slug: "turntables", name: "Turntables", position: 2 },
  { slug: "accessories", name: "Accessories", position: 3 },
];

const BRANDS: BrandSeed[] = [
  { slug: "audio-technica", name: "Audio-Technica" },
  { slug: "audioquest", name: "AudioQuest" },
  { slug: "beyerdynamic", name: "Beyerdynamic" },
  { slug: "hifiman", name: "HiFiMAN" },
  { slug: "jbl", name: "JBL" },
  { slug: "sennheiser", name: "Sennheiser" },
  { slug: "sony", name: "Sony" },
  { slug: "amphion", name: "Amphion" },
  { slug: "gale", name: "Gale" },
  { slug: "genelec", name: "Genelec" },
  { slug: "kef", name: "KEF" },
  { slug: "klipsch", name: "Klipsch" },
  { slug: "monitor-audio", name: "Monitor Audio" },
  { slug: "pro-ject", name: "Pro-Ject" },
  { slug: "rega", name: "Rega" },
  { slug: "technics", name: "Technics" },
  { slug: "thorens", name: "Thorens" },
  { slug: "aston", name: "Aston" },
  { slug: "denon", name: "Denon" },
  { slug: "luxman", name: "Luxman" },
  { slug: "kestrel", name: "Kestrel" },
  { slug: "spl", name: "SPL" },
];

const PRODUCTS: ProductSeed[] = [
  {
    slug: "audio-technica-ath-m50-studio",
    skuBase: "AT-M50S",
    file: "audio-technica-ath-m50.jpg",
    alt: "Audio-Technica ATH-M50 Studio headphones with a coiled cable",
    title: "Audio-Technica ATH-M50 Studio",
    brandSlug: "audio-technica",
    categorySlug: "headphones",
    description:
      "A closed-back studio headphone with 45 mm drivers and a coiled cable. The earcups fold flat for storage and the headband is padded.",
    specs: {
      Driver: "45 mm dynamic",
      Impedance: "38 ohms",
      Weight: "285 g",
      Cable: "3 m coiled",
      Finish: "Black or silver",
    },
    variants: [
      { title: "Black", priceCents: 14_900, stock: 12 },
      { title: "Silver", priceCents: 15_900, stock: 0 },
    ],
  },
  {
    slug: "audio-technica-ath-m70-reference",
    skuBase: "AT-M70R",
    file: "audio-technica-ath-m70x.jpg",
    alt: "Audio-Technica ATH-M70 Reference headphones",
    title: "Audio-Technica ATH-M70 Reference",
    brandSlug: "audio-technica",
    categorySlug: "headphones",
    description:
      "A closed-back monitoring headphone with 45 mm drivers and a detachable straight cable. The earcups rotate for single-ear listening.",
    specs: {
      Driver: "45 mm dynamic",
      Impedance: "38 ohms",
      Weight: "280 g",
      Cable: "3 m detachable",
      Finish: "Black or graphite",
    },
    variants: [
      { title: "Black", priceCents: 29_900, stock: 8 },
      { title: "Graphite", priceCents: 31_900, stock: 5 },
    ],
  },
  {
    slug: "audioquest-nighthawk-carbon",
    skuBase: "AQ-NHC",
    file: "audioquest-nighthawk-carbon.jpg",
    alt: "AudioQuest NightHawk Carbon open-back headphones",
    title: "AudioQuest NightHawk Carbon",
    brandSlug: "audioquest",
    categorySlug: "headphones",
    description:
      "An open-back headphone with a carbon fiber cup and a suspension headband. It ships with two sets of earpads and a carry case.",
    specs: {
      Driver: "50 mm dynamic",
      Impedance: "25 ohms",
      Weight: "346 g",
      Cable: "1.5 m detachable",
      Finish: "Carbon fiber",
    },
    variants: [
      { title: "Carbon", priceCents: 69_900, stock: 3 },
      { title: "Black", priceCents: 74_900, stock: 6 },
    ],
  },
  {
    slug: "beyerdynamic-dt-990-edition",
    skuBase: "BD-DT990",
    file: "beyerdynamic-dt990-pro.jpg",
    alt: "Beyerdynamic DT 990 Edition headphones",
    title: "Beyerdynamic DT 990 Edition",
    brandSlug: "beyerdynamic",
    categorySlug: "headphones",
    description:
      "An open-back headphone with 250 ohm drivers and a replaceable headband pad. The single-sided cable ends in a 3.5 mm plug with a 6.3 mm adapter.",
    specs: {
      Driver: "45 mm dynamic",
      Impedance: "250 ohms",
      Weight: "295 g",
      Cable: "3 m fixed",
      Finish: "Black or silver",
    },
    variants: [
      { title: "Black", priceCents: 17_900, stock: 18 },
      { title: "Silver", priceCents: 19_900, stock: 14 },
    ],
  },
  {
    slug: "hifiman-edition-xs",
    skuBase: "HFM-EDXS",
    file: "hifiman-edition-xs-planar.jpg",
    alt: "HiFiMAN Edition XS planar magnetic headphones",
    title: "HiFiMAN Edition XS",
    brandSlug: "hifiman",
    categorySlug: "headphones",
    description:
      "A planar magnetic headphone with a wide headband and angled earcups. The detachable cable uses 3.5 mm connectors at each cup.",
    specs: {
      Driver: "90 mm planar magnetic",
      Impedance: "18 ohms",
      Weight: "405 g",
      Cable: "1.5 m detachable",
      Finish: "Black or silver",
    },
    variants: [
      { title: "Black", priceCents: 49_900, stock: 4 },
      { title: "Silver", priceCents: 52_900, stock: 2 },
    ],
  },
  {
    slug: "jbl-live-650-wireless",
    skuBase: "JBL-L650",
    file: "jbl-live-650-btnc.jpg",
    alt: "JBL Live 650 Wireless headphones in blue",
    title: "JBL Live 650 Wireless",
    brandSlug: "jbl",
    categorySlug: "headphones",
    description:
      "A wireless over-ear headphone with active noise cancellation and a 30-hour battery. The earcups fold inward for travel.",
    specs: {
      Driver: "40 mm dynamic",
      Battery: "30 hours",
      Weight: "245 g",
      Connectivity: "Bluetooth 5.0",
      Finish: "Blue or black",
    },
    variants: [
      { title: "Blue", priceCents: 12_900, stock: 20 },
      { title: "Black", priceCents: 14_900, stock: 16 },
    ],
  },
  {
    slug: "sennheiser-hd-598",
    skuBase: "SEN-HD598",
    file: "sennheiser-hd598-over-ear.jpg",
    alt: "Sennheiser HD 598 headphones in beige",
    title: "Sennheiser HD 598",
    brandSlug: "sennheiser",
    categorySlug: "headphones",
    description:
      "An open-back headphone with velour earpads and a lightweight headband. The cable is detachable at the cup and comes with a 6.3 mm adapter.",
    specs: {
      Driver: "38 mm dynamic",
      Impedance: "50 ohms",
      Weight: "275 g",
      Cable: "3 m detachable",
      Finish: "Beige or black",
    },
    variants: [
      { title: "Beige", priceCents: 19_900, stock: 9 },
      { title: "Black", priceCents: 21_900, stock: 11 },
    ],
  },
  {
    slug: "sennheiser-hd-800-s",
    skuBase: "SEN-HD800S",
    file: "sennheiser-hd800s-open-back.jpg",
    alt: "Sennheiser HD 800 S headphones",
    title: "Sennheiser HD 800 S",
    brandSlug: "sennheiser",
    categorySlug: "headphones",
    description:
      "An open-back headphone with 56 mm ring-radiator drivers and a steel headband. Each pair ships with two cables and a storage box.",
    specs: {
      Driver: "56 mm ring radiator",
      Impedance: "300 ohms",
      Weight: "330 g",
      Cable: "3 m detachable",
      Finish: "Black or silver",
    },
    variants: [
      { title: "Black", priceCents: 169_900, stock: 2 },
      { title: "Silver", priceCents: 179_900, stock: 1 },
    ],
  },
  {
    slug: "sony-mdr-7506",
    skuBase: "SNY-MDR7506",
    file: "sony-mdr-7506-studio.jpg",
    alt: "Sony MDR-7506 studio headphones",
    title: "Sony MDR-7506",
    brandSlug: "sony",
    categorySlug: "headphones",
    description:
      "A closed-back studio headphone with 40 mm drivers and a coiled cable. The earcups fold for storage and the plug is gold-plated.",
    specs: {
      Driver: "40 mm dynamic",
      Impedance: "63 ohms",
      Weight: "230 g",
      Cable: "3 m coiled",
      Finish: "Black or silver",
    },
    variants: [
      { title: "Black", priceCents: 9_900, stock: 25 },
      { title: "Silver", priceCents: 10_900, stock: 19 },
    ],
  },
  {
    slug: "sony-wh-ch510",
    skuBase: "SNY-WHCH510",
    file: "sony-wh-ch510-wireless.jpg",
    alt: "Sony WH-CH510 wireless headphones",
    title: "Sony WH-CH510",
    brandSlug: "sony",
    categorySlug: "headphones",
    description:
      "An on-ear wireless headphone with a 35-hour battery and USB-C charging. The earcups swivel flat and the design supports voice calls.",
    specs: {
      Driver: "30 mm dynamic",
      Battery: "35 hours",
      Weight: "132 g",
      Connectivity: "Bluetooth 5.0",
      Finish: "Black or blue",
    },
    variants: [
      { title: "Black", priceCents: 5_900, stock: 30 },
      { title: "Blue", priceCents: 6_900, stock: 24 },
    ],
  },
  {
    slug: "amphion-helium-410",
    skuBase: "AMP-HE410",
    file: "amphion-passive-studio-monitor.jpg",
    alt: "Amphion Helium 410 passive studio monitor",
    title: "Amphion Helium 410",
    brandSlug: "amphion",
    categorySlug: "speakers",
    description:
      "A compact passive monitor with a 4.5-inch woofer and a titanium tweeter. The rear port is tuned for close placement against a wall.",
    specs: {
      Woofer: "4.5 in",
      Tweeter: "1 in titanium",
      Impedance: "8 ohms",
      Sensitivity: "86 dB",
      Weight: "4.5 kg",
      Finish: "White or black",
    },
    variants: [
      { title: "White", priceCents: 129_000, stock: 3 },
      { title: "Black", priceCents: 139_000, stock: 2 },
    ],
  },
  {
    slug: "gale-silver-monitor",
    skuBase: "GAL-SILVER",
    file: "gale-silver-monitor-floorstander.jpg",
    alt: "Gale Silver Monitor floor-standing speaker",
    title: "Gale Silver Monitor",
    brandSlug: "gale",
    categorySlug: "speakers",
    description:
      "A floor-standing speaker with a 6.5-inch woofer and a sealed cabinet. The cabinet has a silver finish and sits on a plinth with spikes.",
    specs: {
      Woofer: "6.5 in",
      Tweeter: "1 in dome",
      Impedance: "8 ohms",
      Sensitivity: "89 dB",
      Weight: "12 kg",
      Finish: "Silver or black",
    },
    variants: [
      { title: "Silver", priceCents: 89_900, stock: 2 },
      { title: "Black", priceCents: 94_900, stock: 0 },
    ],
  },
  {
    slug: "genelec-8030a",
    skuBase: "GEN-8030A",
    file: "genelec-8030a-studio-monitor.jpg",
    alt: "Genelec 8030A active studio monitor",
    title: "Genelec 8030A",
    brandSlug: "genelec",
    categorySlug: "speakers",
    description:
      "An active studio monitor with a 5-inch woofer and a 0.75-inch metal dome tweeter. The rear panel has a balanced XLR input and room response controls.",
    specs: {
      Woofer: "5 in",
      Tweeter: "0.75 in metal dome",
      Power: "40 W + 40 W",
      Input: "XLR balanced",
      Weight: "5.6 kg",
      Finish: "Grey or black",
    },
    variants: [
      { title: "Grey", priceCents: 149_000, stock: 5 },
      { title: "Black", priceCents: 159_000, stock: 4 },
    ],
  },
  {
    slug: "kef-blade-two",
    skuBase: "KEF-BLADE2",
    file: "kef-blade-floorstanding.jpg",
    alt: "KEF Blade Two floor-standing speakers",
    title: "KEF Blade Two",
    brandSlug: "kef",
    categorySlug: "speakers",
    description:
      "A floor-standing speaker with a single apparent source driver array and four bass drivers. The slim cabinet has a painted finish and a matching plinth.",
    specs: {
      Drivers: "Uni-Q + 4 x 6.5 in",
      Impedance: "4 ohms",
      Sensitivity: "90 dB",
      Weight: "35 kg",
      Finish: "Gloss black or white",
    },
    variants: [
      { title: "Gloss Black", priceCents: 239_000, stock: 1 },
      { title: "White", priceCents: 249_000, stock: 1 },
    ],
  },
  {
    slug: "kef-ls50-wireless-ii",
    skuBase: "KEF-LS50W2",
    file: "kef-ls50-wireless-pair.jpg",
    alt: "KEF LS50 Wireless II powered speakers",
    title: "KEF LS50 Wireless II",
    brandSlug: "kef",
    categorySlug: "speakers",
    description:
      "A powered bookshelf pair with a Uni-Q driver and built-in streaming. Each speaker has its own amplifier and connects over Wi-Fi or Ethernet.",
    specs: {
      Driver: "5.25 in Uni-Q",
      Amplifier: "380 W per pair",
      Inputs: "HDMI ARC, optical, coaxial",
      Network: "Wi-Fi, Ethernet",
      Finish: "Black or white",
    },
    variants: [
      { title: "Black", priceCents: 199_000, stock: 2 },
      { title: "White", priceCents: 209_000, stock: 3 },
    ],
  },
  {
    slug: "kef-lsx",
    skuBase: "KEF-LSX",
    file: "kef-lsx-wireless-red.jpg",
    alt: "KEF LSX powered speakers in red",
    title: "KEF LSX",
    brandSlug: "kef",
    categorySlug: "speakers",
    description:
      "A compact powered speaker pair with a 4.5-inch Uni-Q driver and Bluetooth streaming. The two cabinets connect with a supplied cable or wirelessly.",
    specs: {
      Driver: "4.5 in Uni-Q",
      Amplifier: "100 W per pair",
      Inputs: "Optical, 3.5 mm, Bluetooth",
      Finish: "Red or blue",
    },
    variants: [
      { title: "Red", priceCents: 119_000, stock: 3 },
      { title: "Blue", priceCents: 129_000, stock: 2 },
    ],
  },
  {
    slug: "klipsch-aw-525",
    skuBase: "KLP-AW525",
    file: "klipsch-aw-525-outdoor.jpg",
    alt: "Klipsch AW-525 outdoor speaker",
    title: "Klipsch AW-525",
    brandSlug: "klipsch",
    categorySlug: "speakers",
    description:
      "An outdoor speaker with a 5.25-inch woofer and a horn-loaded tweeter. The sealed enclosure is rated for rain and has a rust-resistant grille.",
    specs: {
      Woofer: "5.25 in",
      Tweeter: "1 in horn",
      Impedance: "8 ohms",
      Sensitivity: "94 dB",
      Weight: "2.7 kg",
      Finish: "White or black",
    },
    variants: [
      { title: "White", priceCents: 39_900, stock: 7 },
      { title: "Black", priceCents: 42_900, stock: 6 },
    ],
  },
  {
    slug: "monitor-audio-studio",
    skuBase: "MNA-STUDIO",
    file: "monitor-audio-studio-bookshelf.jpg",
    alt: "Monitor Audio Studio bookshelf speakers",
    title: "Monitor Audio Studio",
    brandSlug: "monitor-audio",
    categorySlug: "speakers",
    description:
      "A bookshelf speaker with a 6.5-inch mid-bass driver and a ribbon tweeter. The cabinet uses a braced MDF enclosure and a rear bass reflex port.",
    specs: {
      Woofer: "6.5 in",
      Tweeter: "Ribbon",
      Impedance: "4 ohms",
      Sensitivity: "87 dB",
      Weight: "7.8 kg",
      Finish: "Black or walnut",
    },
    variants: [
      { title: "Black", priceCents: 89_900, stock: 4 },
      { title: "Walnut", priceCents: 99_900, stock: 3 },
    ],
  },
  {
    slug: "sony-ss-cs5",
    skuBase: "SNY-SSCS5",
    file: "sony-bookshelf-speaker-pair.jpg",
    alt: "Sony SS-CS5 bookshelf speaker pair",
    title: "Sony SS-CS5",
    brandSlug: "sony",
    categorySlug: "speakers",
    description:
      "A bookshelf speaker pair with a 5.25-inch woofer and a 1-inch soft dome tweeter. The cabinets have a rear port and a black wood-grain finish.",
    specs: {
      Woofer: "5.25 in",
      Tweeter: "1 in dome",
      Impedance: "6 ohms",
      Sensitivity: "87 dB",
      Weight: "4 kg",
      Finish: "Black or walnut",
    },
    variants: [
      { title: "Black", priceCents: 14_900, stock: 14 },
      { title: "Walnut", priceCents: 16_900, stock: 11 },
    ],
  },
  {
    slug: "pro-ject-debut-evo-2",
    skuBase: "PRJ-DEBUT2",
    file: "pro-ject-debut-evo-2.jpg",
    alt: "Pro-Ject Debut EVO 2 turntable in wine red",
    title: "Pro-Ject Debut EVO 2",
    brandSlug: "pro-ject",
    categorySlug: "turntables",
    description:
      "A belt-drive turntable with an 8.6-inch aluminum tonearm and a pre-mounted cartridge. The plinth has a satin finish and the steel platter includes a felt mat.",
    specs: {
      Drive: "Belt",
      Speeds: "33/45 rpm",
      Tonearm: "8.6 in aluminum",
      Cartridge: "Pick it MM",
      Weight: "5.8 kg",
      Finish: "Wine red or black",
    },
    variants: [
      { title: "Wine Red", priceCents: 59_900, stock: 6 },
      { title: "Black", priceCents: 64_900, stock: 4 },
    ],
  },
  {
    slug: "pro-ject-rpm-3",
    skuBase: "PRJ-RPM3",
    file: "pro-ject-rpm-3-turntable.jpg",
    alt: "Pro-Ject RPM 3 turntable with carbon tonearm",
    title: "Pro-Ject RPM 3",
    brandSlug: "pro-ject",
    categorySlug: "turntables",
    description:
      "A belt-drive turntable with a one-piece carbon tonearm and a separate motor pod. The acrylic platter sits on a three-point support.",
    specs: {
      Drive: "Belt",
      Speeds: "33/45 rpm",
      Tonearm: "9 in carbon",
      Cartridge: "Pick it MM",
      Weight: "6.2 kg",
      Finish: "Black or white",
    },
    variants: [
      { title: "Black", priceCents: 74_900, stock: 3 },
      { title: "White", priceCents: 79_900, stock: 1 },
    ],
  },
  {
    slug: "rega-planar-3",
    skuBase: "REGA-P3",
    file: "rega-planar-3-belt-drive.jpg",
    alt: "Rega Planar 3 turntable",
    title: "Rega Planar 3",
    brandSlug: "rega",
    categorySlug: "turntables",
    description:
      "A belt-drive turntable with an RB330 tonearm and a glass platter. The plinth is laminated and the motor uses a 24 V synchronous supply.",
    specs: {
      Drive: "Belt",
      Speeds: "33/45 rpm",
      Tonearm: "RB330",
      Cartridge: "Elys 2",
      Weight: "6 kg",
      Finish: "Black or white",
    },
    variants: [
      { title: "Black", priceCents: 94_900, stock: 4 },
      { title: "White", priceCents: 99_900, stock: 2 },
    ],
  },
  {
    slug: "technics-sl-120",
    skuBase: "TEC-SL120",
    file: "technics-sl-120-turntable.jpg",
    alt: "Technics SL-120 turntable",
    title: "Technics SL-120",
    brandSlug: "technics",
    categorySlug: "turntables",
    description:
      "A direct-drive turntable with a static-balanced tonearm and a die-cast aluminum platter. The pitch control covers ±8 percent and the chassis has a matte finish.",
    specs: {
      Drive: "Direct",
      Speeds: "33/45 rpm",
      Tonearm: "Static balanced",
      Cartridge: "Moving magnet",
      Weight: "7.5 kg",
      Finish: "Silver or black",
    },
    variants: [
      { title: "Silver", priceCents: 39_900, stock: 5 },
      { title: "Black", priceCents: 44_900, stock: 3 },
    ],
  },
  {
    slug: "technics-sl-1200-mk5",
    skuBase: "TEC-SL1200",
    file: "technics-sl-1200mk5-direct-drive.jpg",
    alt: "Technics SL-1200 MK5 direct-drive turntable",
    title: "Technics SL-1200 MK5",
    brandSlug: "technics",
    categorySlug: "turntables",
    description:
      "A direct-drive turntable built for club use, with a high-torque motor and a heavy rubber mat. The tonearm height and anti-skate are adjustable.",
    specs: {
      Drive: "Direct",
      Speeds: "33/45 rpm",
      Tonearm: "S-shaped",
      Cartridge: "Ortofon",
      Weight: "12 kg",
      Finish: "Silver or black",
    },
    variants: [
      { title: "Silver", priceCents: 129_000, stock: 2 },
      { title: "Black", priceCents: 139_000, stock: 1 },
    ],
  },
  {
    slug: "thorens-td-115",
    skuBase: "THO-TD115",
    file: "thorens-td-115-turntable.jpg",
    alt: "Thorens TD-115 turntable in walnut",
    title: "Thorens TD-115",
    brandSlug: "thorens",
    categorySlug: "turntables",
    description:
      "A belt-drive turntable with a floating subchassis and a TP 11 tonearm. The platter is zinc alloy and the plinth is finished in walnut veneer.",
    specs: {
      Drive: "Belt",
      Speeds: "33/45 rpm",
      Tonearm: "TP 11",
      Cartridge: "Moving magnet",
      Weight: "8 kg",
      Finish: "Walnut or black",
    },
    variants: [
      { title: "Walnut", priceCents: 69_900, stock: 3 },
      { title: "Black", priceCents: 74_900, stock: 0 },
    ],
  },
  {
    slug: "aston-origin",
    skuBase: "AST-ORIGIN",
    file: "aston-origin-condenser-mic.jpg",
    alt: "Aston Origin condenser microphone",
    title: "Aston Origin",
    brandSlug: "aston",
    categorySlug: "accessories",
    description:
      "A large-diaphragm condenser microphone with a cardioid pickup pattern and a built-in pop filter. The body is machined from aluminum and uses a 48 V phantom supply.",
    specs: {
      Type: "Condenser",
      Pattern: "Cardioid",
      Diaphragm: "32 mm",
      Power: "48 V phantom",
      Weight: "450 g",
      Finish: "Silver or black",
    },
    variants: [
      { title: "Silver", priceCents: 29_900, stock: 6 },
      { title: "Black", priceCents: 31_900, stock: 4 },
    ],
  },
  {
    slug: "denon-pma-500ae",
    skuBase: "DEN-PMA500",
    file: "denon-pma-500ae-amplifier.jpg",
    alt: "Denon PMA-500AE integrated amplifier",
    title: "Denon PMA-500AE",
    brandSlug: "denon",
    categorySlug: "accessories",
    description:
      "An integrated stereo amplifier with 45 watts per channel into 8 ohms. It has four line inputs, a phono stage and a headphone output.",
    specs: {
      Power: "45 W per channel",
      Inputs: "4 line, phono",
      Impedance: "8 ohms",
      Weight: "7.5 kg",
      Finish: "Silver or black",
    },
    variants: [
      { title: "Silver", priceCents: 44_900, stock: 4 },
      { title: "Black", priceCents: 47_900, stock: 2 },
    ],
  },
  {
    slug: "luxman-l-210",
    skuBase: "LUX-L210",
    file: "luxman-l-210-amplifier.jpg",
    alt: "Luxman L-210 integrated amplifier",
    title: "Luxman L-210",
    brandSlug: "luxman",
    categorySlug: "accessories",
    description:
      "An integrated amplifier with a brushed aluminum front panel and a moving magnet phono stage. The output stage delivers 50 watts per channel into 8 ohms.",
    specs: {
      Power: "50 W per channel",
      Inputs: "3 line, phono",
      Weight: "8.2 kg",
      Finish: "Silver or black",
    },
    variants: [
      { title: "Silver", priceCents: 89_900, stock: 2 },
      { title: "Black", priceCents: 94_900, stock: 1 },
    ],
  },
  {
    slug: "kestrel-pocket-dac",
    skuBase: "KST-DAC1",
    file: "portable-usb-dac-amp.jpg",
    alt: "Kestrel Pocket DAC and headphone amplifier",
    title: "Kestrel Pocket DAC",
    brandSlug: "kestrel",
    categorySlug: "accessories",
    description:
      "A portable USB DAC and headphone amplifier with a machined aluminum case. It supports PCM files up to 32-bit/384 kHz and has a 3.5 mm output.",
    specs: {
      DAC: "32-bit/384 kHz",
      Output: "3.5 mm",
      Input: "USB-C",
      Weight: "48 g",
      Finish: "Black or silver",
    },
    variants: [
      { title: "Black", priceCents: 1_900, stock: 40 },
      { title: "Silver", priceCents: 2_400, stock: 35 },
    ],
  },
  {
    slug: "spl-phonitor-2",
    skuBase: "SPL-PHON2",
    file: "spl-phonitor-2-headphone-amp.jpg",
    alt: "SPL Phonitor 2 headphone amplifier",
    title: "SPL Phonitor 2",
    brandSlug: "spl",
    categorySlug: "accessories",
    description:
      "A headphone amplifier and monitor controller with balanced XLR inputs and a matrix crossfeed circuit. The front panel has two headphone outputs and a stepped volume control.",
    specs: {
      Inputs: "XLR, 1/4 in",
      Outputs: "2 headphone",
      Power: "2 x 1.5 W",
      Weight: "2.9 kg",
      Finish: "Black or silver",
    },
    variants: [
      { title: "Black", priceCents: 189_900, stock: 2 },
      { title: "Silver", priceCents: 199_900, stock: 1 },
    ],
  },
];

const USER_EPOCH = new Date("2026-01-05T09:00:00.000Z");
const PRODUCT_EPOCH = Date.UTC(2026, 0, 1);
const ORDER_EPOCH = new Date("2026-09-15T10:00:00.000Z");

interface VariantSnapshot {
  id: string;
  sku: string;
  nameSnapshot: string;
  unitPriceCents: number;
}

function skuFor(product: ProductSeed, variant: VariantSeed): string {
  return `${product.skuBase}-${variant.title.toUpperCase().replaceAll(/[^A-Z0-9]+/g, "-")}`;
}

async function main(): Promise<void> {
  const seed = parseSeed(process.argv);
  if (!Number.isInteger(seed) || seed < 0) {
    throw new Error(`--seed must be a non-negative integer, got ${String(seed)}`);
  }

  for (const product of PRODUCTS) {
    const imagePath = join(process.cwd(), "public", "products", product.file);
    if (!existsSync(imagePath)) {
      throw new Error(`missing product image public/products/${product.file}`);
    }
  }

  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "WebhookEvent", "StockReservation", "OrderItem", "Order", "CartItem", "Cart", "ProductImage", "Variant", "Product", "Brand", "Category", "Address", "User" RESTART IDENTITY CASCADE',
  );

  const categoryIds = new Map<string, string>();
  for (const [index, category] of CATEGORIES.entries()) {
    const id = deterministicUuid7(index, `category:${seed}:${category.slug}`);
    categoryIds.set(category.slug, id);
    await prisma.category.create({
      data: {
        id,
        slug: category.slug,
        name: category.name,
        position: category.position,
      },
    });
  }

  const brandIds = new Map<string, string>();
  for (const [index, brand] of BRANDS.entries()) {
    const id = deterministicUuid7(100 + index, `brand:${seed}:${brand.slug}`);
    brandIds.set(brand.slug, id);
    await prisma.brand.create({
      data: { id, slug: brand.slug, name: brand.name },
    });
  }

  const variantsBySku = new Map<string, VariantSnapshot>();

  for (const [productIndex, product] of PRODUCTS.entries()) {
    const brandId = brandIds.get(product.brandSlug);
    const categoryId = categoryIds.get(product.categorySlug);
    if (brandId === undefined) {
      throw new Error(`unknown brand ${product.brandSlug}`);
    }
    if (categoryId === undefined) {
      throw new Error(`unknown category ${product.categorySlug}`);
    }

    const productId = deterministicUuid7(1_000 + productIndex, `product:${seed}:${product.slug}`);
    const variantData = product.variants.map((variant, variantIndex) => {
      const id = deterministicUuid7(
        2_000 + productIndex * 10 + variantIndex,
        `variant:${seed}:${product.slug}:${variant.title}`,
      );
      return {
        id,
        sku: skuFor(product, variant),
        title: variant.title,
        priceCents: variant.priceCents,
        stock: variant.stock,
        position: variantIndex,
      };
    });

    const created = await prisma.product.create({
      data: {
        id: productId,
        slug: product.slug,
        title: product.title,
        brandId,
        categoryId,
        description: product.description,
        specs: product.specs,
        status: "ACTIVE",
        createdAt: new Date(PRODUCT_EPOCH + productIndex * 3_600_000),
        images: {
          create: [
            {
              id: deterministicUuid7(
                3_000 + productIndex,
                `image:${seed}:${product.slug}:${product.file}`,
              ),
              url: `/products/${product.file}`,
              alt: product.alt,
              position: 0,
            },
          ],
        },
        variants: { create: variantData },
      },
      include: { variants: true },
    });

    if (created.variants.length !== product.variants.length) {
      throw new Error(`variant count mismatch for ${product.slug}`);
    }

    for (const variant of created.variants) {
      const source = product.variants.find(
        (candidate) => skuFor(product, candidate) === variant.sku,
      );
      if (source === undefined) {
        throw new Error(`unexpected variant ${variant.sku}`);
      }
      variantsBySku.set(variant.sku, {
        id: variant.id,
        sku: variant.sku,
        nameSnapshot: `${product.title} — ${source.title}`,
        unitPriceCents: variant.priceCents,
      });
    }
  }

  const [demoHash, adminHash] = await Promise.all([
    hash("demo-password-123"),
    hash("admin-password-123"),
  ]);

  const demoUserId = deterministicUuid7(5_000, `user:${seed}:demo`);
  const adminUserId = deterministicUuid7(5_001, `user:${seed}:admin`);

  await prisma.user.createMany({
    data: [
      {
        id: demoUserId,
        email: "demo@kestrel.test",
        passwordHash: demoHash,
        name: "Demo Customer",
        role: "CUSTOMER",
        createdAt: USER_EPOCH,
      },
      {
        id: adminUserId,
        email: "admin@kestrel.test",
        passwordHash: adminHash,
        name: "Store Admin",
        role: "ADMIN",
        createdAt: USER_EPOCH,
      },
    ],
  });

  const addresses = [
    {
      id: deterministicUuid7(5_100, `address:${seed}:home`),
      userId: demoUserId,
      label: "Home",
      line1: "18 Rue de la République",
      line2: "Apt 4B",
      city: "Lyon",
      postalCode: "69001",
      country: "France",
      isDefault: true,
    },
    {
      id: deterministicUuid7(5_101, `address:${seed}:office`),
      userId: demoUserId,
      label: "Office",
      line1: "240 Rue Garibaldi",
      line2: "Floor 3",
      city: "Lyon",
      postalCode: "69001",
      country: "France",
      isDefault: false,
    },
    {
      id: deterministicUuid7(5_102, `address:${seed}:studio`),
      userId: demoUserId,
      label: "Studio",
      line1: "77 Cours Émile Zola",
      line2: "Unit 12",
      city: "Villeurbanne",
      postalCode: "69100",
      country: "France",
      isDefault: false,
    },
  ] as const;

  await prisma.address.createMany({ data: [...addresses] });

  const shippingAddress = {
    label: addresses[0].label,
    line1: addresses[0].line1,
    line2: addresses[0].line2,
    city: addresses[0].city,
    postalCode: addresses[0].postalCode,
    country: addresses[0].country,
  };

  let orderItemSeq = 0;
  function line(sku: string, quantity: number) {
    const variant = variantsBySku.get(sku);
    if (variant === undefined) {
      throw new Error(`seed order references unknown sku ${sku}`);
    }
    orderItemSeq += 1;
    return {
      id: deterministicUuid7(6_000 + orderItemSeq, `order-item:${seed}:${sku}:${quantity}`),
      variantId: variant.id,
      sku: variant.sku,
      nameSnapshot: variant.nameSnapshot,
      unitPriceCents: variant.unitPriceCents,
      quantity,
    };
  }

  const paidItems = [
    line("SEN-HD598-BEIGE", 1),
    line("KST-DAC1-BLACK", 1),
  ];
  const paidSubtotal = paidItems.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0,
  );
  const paidShipping = shippingForSubtotal(paidSubtotal, "STANDARD");

  const fulfilledItems = [
    line("PRJ-DEBUT2-WINE-RED", 1),
    line("SNY-MDR7506-BLACK", 2),
  ];
  const fulfilledSubtotal = fulfilledItems.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0,
  );
  const fulfilledShipping = 0;

  await prisma.order.create({
    data: {
      id: deterministicUuid7(7_000, `order:${seed}:paid`),
      number: "KST-2601-0001",
      userId: demoUserId,
      status: "PAID",
      subtotalCents: paidSubtotal,
      shippingCents: paidShipping,
      totalCents: paidSubtotal + paidShipping,
      currency: "eur",
      idempotencyKey: `seed-order-paid-${seed}`,
      address: shippingAddress,
      createdAt: ORDER_EPOCH,
      paidAt: ORDER_EPOCH,
      items: { create: paidItems },
    },
  });

  await prisma.order.create({
    data: {
      id: deterministicUuid7(7_001, `order:${seed}:fulfilled`),
      number: "KST-2601-0002",
      userId: demoUserId,
      status: "FULFILLED",
      subtotalCents: fulfilledSubtotal,
      shippingCents: fulfilledShipping,
      totalCents: fulfilledSubtotal + fulfilledShipping,
      currency: "eur",
      idempotencyKey: `seed-order-fulfilled-${seed}`,
      address: shippingAddress,
      createdAt: new Date(ORDER_EPOCH.getTime() + 86_400_000),
      paidAt: new Date(ORDER_EPOCH.getTime() + 86_400_000),
      items: { create: fulfilledItems },
    },
  });

  const [categories, brands, products, variants, images, users, addressCount, orders, orderItems] =
    await Promise.all([
      prisma.category.count(),
      prisma.brand.count(),
      prisma.product.count(),
      prisma.variant.count(),
      prisma.productImage.count(),
      prisma.user.count(),
      prisma.address.count(),
      prisma.order.count(),
      prisma.orderItem.count(),
    ]);

  if (categories !== 4) {
    throw new Error(`expected 4 categories, got ${categories}`);
  }
  if (products !== 30) {
    throw new Error(`expected 30 products, got ${products}`);
  }
  if (variants < 44) {
    throw new Error(`expected at least 44 variants, got ${variants}`);
  }
  if (images !== products) {
    throw new Error(`expected one image per product, got ${images}`);
  }
  if (users !== 2) {
    throw new Error(`expected 2 users, got ${users}`);
  }
  if (addressCount !== 3) {
    throw new Error(`expected 3 addresses, got ${addressCount}`);
  }
  if (orders !== 2 || orderItems !== paidItems.length + fulfilledItems.length) {
    throw new Error(`expected 2 orders and ${paidItems.length + fulfilledItems.length} items`);
  }
  if (brands < 8) {
    throw new Error(`expected at least 8 brands, got ${brands}`);
  }

  const outOfRange = await prisma.variant.count({
    where: { OR: [{ priceCents: { lt: 1_900 } }, { priceCents: { gt: 249_000 } }] },
  });
  if (outOfRange !== 0) {
    throw new Error(`${outOfRange} variant prices are outside 1900..249000 cents`);
  }

  const soldOut = await prisma.variant.count({ where: { stock: 0 } });
  if (soldOut === 0) {
    throw new Error("expected at least one sold-out variant");
  }

  const orderStates = await prisma.order.groupBy({ by: ["status"], _count: { _all: true } });
  const stateSummary = orderStates
    .map((row) => `${row.status}=${row._count._all}`)
    .sort()
    .join(",");

  console.log(
    `seed=${seed} categories=${categories} brands=${brands} products=${products} variants=${variants} images=${images} users=${users} addresses=${addressCount} orders=${orders} order_items=${orderItems} sold_out_variants=${soldOut} order_states=${stateSummary}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
