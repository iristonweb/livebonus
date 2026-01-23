export type AccountType = "individual" | "legal";
export type Intent = "rent_out" | "rent_in";

export type ListingForm = {
  city: string;
  district: string;
  metro: string;
  propertyType: "apartment" | "room" | "house" | "other";
  rooms: string;
  areaM2: string;
  floor: string;
  floorsTotal: string;
  furnished: "yes" | "no" | "partly";
  petsAllowed: "yes" | "no" | "negotiable";
  moveInFrom: string;
  priceRub: string;
  depositRub: string;
  utilities: "included" | "separate" | "partly";
  contractTerm: "short" | "long" | "negotiable";
  description: string;
  invoiceNeeded?: "yes" | "no"; // legal extra
};

export type SearchForm = {
  city: string;
  districts: string;
  metro: string;
  propertyType: "apartment" | "room" | "house" | "any";
  rooms: string;
  budgetFrom: string;
  budgetTo: string;
  moveInFrom: string;
  leaseTerm: "short" | "long" | "any";
  furnished: "required" | "optional" | "no";
  pets: "yes" | "no" | "negotiable";
  metroMaxMinutes: string;
  notes: string;
  forEmployees?: "yes" | "no"; // legal extra
  invoiceNeeded?: "yes" | "no"; // legal extra
};

export function titleFor(accountType: AccountType, intent: Intent): string {
  const who = accountType === "legal" ? "Юрлицо" : "Физлицо";
  const what = intent === "rent_out" ? "Сдать жильё" : "Арендовать жильё";
  return `${who} · ${what}`;
}

export function canContinueApply(intent: Intent, listing: ListingForm, search: SearchForm): boolean {
  if (intent === "rent_out") {
    return listing.city.trim().length > 1 && listing.priceRub.trim().length > 0;
  }
  return search.city.trim().length > 1 && (search.budgetTo.trim().length > 0 || search.budgetFrom.trim().length > 0);
}

