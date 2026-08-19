const COMPANY_ALIASES = new Map<string, string>([
  ["cursoranysphere", "Cursor"],
  ["nvidia", "NVIDIA"],
  ["ubertechnologiesinc", "Uber"],
  ["citadelsecurities", "Citadel"],
  ["andurilindustries", "Anduril"],
  ["appliedsystemsinc", "Applied Systems"],
  ["klacorporation", "KLA"],
  ["mcdonaldscorporation", "McDonald's"],
  ["medpaceinc", "Medpace"],
  ["qualcommcanadaulc", "Qualcomm"],
  ["qualcomminnovationcenterinc", "Qualcomm"],
  ["qualcommtechnologiesinc", "Qualcomm"],
  ["universityoftexasaustin", "University of Texas at Austin"],
  ["akunacapitaluniversity", "Akuna Capital"],
  ["oldmission", "Old Mission Capital"],
  ["generaldynamicsinformationtechnology", "General Dynamics"],
  ["generaldynamicsmissionsystems", "General Dynamics"],
  ["invisibletechnologiesai", "Invisible Technologies"],
  ["aurorainnovation", "Aurora"],
  ["twitchinteractiveinc", "Twitch"],
  ["imc", "IMC Trading"],
  ["stampw25", "Stamp"],
  ["wanderlogw19", "Wanderlog"],
  ["av", "AeroVironment"],
  ["i3", "Integration Innovation (i3)"],
  ["pennstateuniversity", "Pennsylvania State University"],
  ["theboeingcompany", "Boeing"],
]);

function aliasKey(company: string): string {
  return company
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

// Curated aliases only: broad fuzzy or suffix matching can incorrectly merge
// unrelated employers such as Artera and Artera Technologies.
export function canonicalCompanyName(company: string): string {
  const display = company.trim().replace(/\s+/g, " ");
  if (!display) return "";
  return COMPANY_ALIASES.get(aliasKey(display)) ?? display;
}

export function canonicalCompanyKey(company: string): string {
  return canonicalCompanyName(company).toLowerCase();
}
