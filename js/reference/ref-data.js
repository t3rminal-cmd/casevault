/* CaseVault — reference data: narcotics street values (for the value calculator and chart),
 * incident location codes and commonly used UCR codes.
 *
 * Taken from LE Cyber-Docs (t3rminal-cmd/LE-CyberDocs on GitHub, MIT). It is a quick
 * reference only: follow your department's policies.
 */
'use strict';

(function (root) {
  /* ---------- Narcotics street values (HIDTA 2022), per unit ---------- */
  //   cat:    section the drug is listed under
  //   verify: units whose price looks wrong but couldn't be corrected without new data
  // A pound price that is just the gram price x 454 is shown as an estimate.
  const NARCOTIC_SOURCE = 'HIDTA 2022';
  const NARCOTIC_CATEGORIES = [
  "Cocaine", "Heroin", "Fentanyl", "Methamphetamine", "Marijuana & THC",
  "Pills (per pill)", "Hallucinogens & Club Drugs", "Steroids",
];
  const NARCOTIC_DATA = {
  "Cocaine (Powder)": { cat: "Cocaine", gram: 125.0, ounce: 1200.0, pound: 22700.0, kilogram: 32000.0 },
  "Cocaine (Crack)": { cat: "Cocaine", gram: 123.0, ounce: 1000.0, pound: 4540.0, verify: ["pound"] },
  "Heroin (Tan)": { cat: "Heroin", gram: 100.0, pound: 45359.2 },
  "Heroin (White)": { cat: "Heroin", gram: 150.0, pound: 68038.8 },
  "Heroin (Black Tar)": { cat: "Heroin", gram: 150.0, pound: 68038.8 },
  Fentanyl: { cat: "Fentanyl", gram: 155.55, ounce: 1500.0, pound: 70612.7, kilogram: 40000.0, verify: ["pound"] },
  Methamphetamine: { cat: "Methamphetamine", gram: 330.0, ounce: 800.0, pound: 1200.0, verify: ["gram"] },
  "Marijuana (Domestic)": { cat: "Marijuana & THC", gram: 4.41, pound: 2000.0 },
  "Marijuana (Mexican)": { cat: "Marijuana & THC", gram: 2.64, pound: 1200.0 },
  "Marijuana (Sinsemilla)": { cat: "Marijuana & THC", gram: 16.0, pound: 7256.0 },
  "Tetrahydrocannabinol (Gummies)": { cat: "Marijuana & THC", gram: 16.0, pound: 7256.0 },
  "Tetrahydrocannabinol (Liquid)": { cat: "Marijuana & THC", gram: 80.0, pound: 36320.0 },
  "Tetrahydrocannabinol (Wax)": { cat: "Marijuana & THC", gram: 80.0, pound: 36320.0 },
  Adderall: { cat: "Pills (per pill)", pill: 10.0 },
  Alprazolam: { cat: "Pills (per pill)", pill: 10.0 },
  Ecstasy: { cat: "Pills (per pill)", pill: 25.0 },
  "Hydrocodone 10mg": { cat: "Pills (per pill)", pill: 15.0 },
  "Hydrocodone 30mg": { cat: "Pills (per pill)", pill: 20.0 },
  "Hydrocodone 80mg": { cat: "Pills (per pill)", pill: 25.0, verify: ["pill"] },
  "Oxycodone 10mg": { cat: "Pills (per pill)", pill: 10.0 },
  "Oxycodone 30mg": { cat: "Pills (per pill)", pill: 30.0 },
  "Oxycodone 80mg": { cat: "Pills (per pill)", pill: 50.0 },
  Percocet: { cat: "Pills (per pill)", pill: 10.0 },
  Ritalin: { cat: "Pills (per pill)", pill: 3.5 },
  Suboxone: { cat: "Pills (per pill)", pill: 10.0 },
  Viagra: { cat: "Pills (per pill)", pill: 10.0 },
  Vicodin: { cat: "Pills (per pill)", pill: 10.0 },
  Ketamine: { cat: "Hallucinogens & Club Drugs", gram: 100.0, pill: 20.0, pound: 45400.0 },
  LSD: { cat: "Hallucinogens & Club Drugs", gram: 5.0, pill: 10.0, pound: 2270.0, verify: ["gram"] },
  MDMA: { cat: "Hallucinogens & Club Drugs", gram: 100.0, pill: 20.0, pound: 45400.0 },
  Psilocybin: { cat: "Hallucinogens & Club Drugs", gram: 9.0, pound: 4086.0 },
  // The old list had these under the wrong units: $69.83 x 16 = $1,117.28 (ounce -> pound)
  // and $5 x 454 = $2,270 (gram -> pound).
  "Steroids (Liquid) 1": { cat: "Steroids", ounce: 69.83, pound: 1117.28 },
  "Steroids (Liquid) 2": { cat: "Steroids", kilogram: 2.33, verify: ["kilogram"] },
  "Steroids (Powder)": { cat: "Steroids", gram: 5.0, pound: 2270.0 },
};

  /* ---------- Incident location codes and commonly used UCR codes ---------- */
  const LOCATION_CODES = [{"key": "business-commercial", "title": "Business/Commercial", "codes": [["097", "Appliance Store"], ["206", "Athletic Club"], ["103", "Bar/Tavern"], ["167", "Barber/Beauty Shop"], ["109", "Bowling Alley"], ["140", "Commercial/Business Office"], ["144", "Car Wash"], ["192", "Cleaning Store"], ["160", "Coin Op Machine"], ["161", "Pawn Shop"], ["162", "Convenience Store"], ["174", "Dept Store"], ["193", "Drug Store"], ["209", "Factory/Man Building"], ["220", "Gas Station"], ["221", "Grocery/Food Store"], ["260", "Hotel/Motel"], ["267", "Movie Theater"], ["165", "Newstand"], ["277", "Parking Lot/Garage"], ["166", "Pool Room"], ["293", "Restaurant"], ["261", "Small Retail Store"], ["305", "Sports Arena"], ["327", "Warehouse"], ["280", "Police Facility/Vehicle/Lot"]]}, {"key": "financial-institution", "title": "Financial Institution", "codes": [["100", "Bank"], ["175", "Credit Union"], ["168", "Currency Exchange"], ["298", "Savings and Loan"], ["164", "ATM"]]}, {"key": "medical", "title": "Medical", "codes": [["230", "Animal Hospital/Vet Clinic"], ["233", "Hospital Building/Grounds"], ["250", "Medical/Dental Office"], ["268", "Nursing Home"]]}, {"key": "miscellaneous", "title": "Miscellaneous", "codes": [["096", "Abandoned Building"], ["145", "Cemetery"], ["151", "Church/Synagogue/Place of Worship"], ["171", "Construction Site"], ["200", "Vacant Lot/Land"]]}, {"key": "public-building-property-way", "title": "Public Building/Property/Way", "codes": [["092", "Alley"], ["132", "Bridge"], ["284", "Federal Building"], ["212", "Fire Station"], ["270", "Forest Preserve"], ["292", "Government Building/Property"], ["238", "Highway/Expressway"], ["273", "Lake/Waterway/Riverbank"], ["245", "Library"], ["269", "Park Property"], ["281", "Jail/Lock-Up Facility"], ["303", "Sidewalk"], ["304", "Street"]]}, {"key": "residential-public-private", "title": "Residential Public & Private", "codes": [["909", "Apartment"], ["121", "CHA Apartment"], ["122", "CHA Hallway/Elevator/Stairwell"], ["123", "CHA Parking Lot/Grounds"], ["290", "Residence"], ["176", "Residence - Driveway"], ["210", "Residence - Garage"], ["289", "Residence - Porch/Hallway"], ["291", "Residence - Yard (Front/Back)"]]}, {"key": "transportation", "title": "Transportation", "codes": [["095", "Airport/Aircraft"], ["104", "Boat/Watercraft"], ["119", "CTA"], ["322", "CTA-Parking Lot/Garage/Other Property"], ["220", "Gas Station"], ["323", "CTA Platform"], ["321", "CTA Train"], ["317", "Other Railroad Property/Train Depot"], ["309", "Taxicab"], ["262", "Vehicle Commercial"], ["126", "Vehicle Delivery Truck"], ["259", "Vehicle Non-Commercial"], ["257", "Other Commercial Trans"]]}, {"key": "school-univ-child-care", "title": "School/Univ/Child Care", "codes": [["169", "College/University Building/Grounds"], ["170", "College/University Residence Hall"], ["177", "Day Care Center"], ["313", "School Private Building"], ["299", "School Private Grounds"], ["314", "School Public Building"], ["300", "School Public Grounds"]]}, {"key": "other-location-not-listed", "title": "Other Location Not Listed", "codes": [["330", "OTHER (SPECIFY)"]]}];
  const UCR_CODES = [{"key": "arson-explosives", "title": "Arson/Explosives", "codes": [["1010", "By Explosive"], ["1020", "By Incendiary Device"], ["1025", "Agg: Arson"], ["1030", "Possession: Explosives, Incendiary Device"], ["1090", "Attempt Arson"]]}, {"key": "assault", "title": "Assault", "codes": [["051A", "Agg: Handgun"], ["051B", "Agg: Other Firearm"], ["0520", "Agg: Knife or Cutting Instrument"], ["0530", "Agg: Other Dangerous Weapon"], ["0560", "Simple Assault"], ["0580", "Stalking-Simple"], ["0581", "Stalking-Aggravated"]]}, {"key": "battery", "title": "Battery", "codes": [["041A", "Agg: Handgun"], ["041B", "Agg: Other Firearm"], ["0420", "Agg: Knife or Cutting Instrument"], ["0430", "Agg: Other Dangerous Weapon"], ["0440", "Agg: Hands, Fist, Feet"], ["0460", "Simple Battery"], ["0486", "Battery/Domestic-Simple"]]}, {"key": "burglary", "title": "Burglary", "codes": [["0610", "Forcible Entry"], ["0620", "Unlawful Entry, No Force"], ["0630", "Attempt: Forcible Entry"]]}, {"key": "criminal-damage-trespass-to-property", "title": "Criminal Damage & Trespass to Property", "codes": [["1310", "Criminal Damage to Property"], ["1320", "Criminal Damage to Vehicle"], ["1330", "Criminal Trespass to Land"], ["1340", "Criminal Damage to State-Supported Land"], ["1350", "Criminal Trespass to State-Supported Land"], ["1360", "Criminal Trespass to Vehicle"], ["1365", "Criminal Trespass to Residence"], ["1370", "Criminal Damage to Firefighting Apparatus, Hydrants, or Equipment"]]}, {"key": "deception", "title": "Deception", "codes": [["1130", "Fraud"], ["1140", "Embezzlement"], ["1150", "Credit Card, Illegal Use"], ["1151", "Cash Dispensing Card, Illegal Use"], ["1200", "Stolen Property: Buy/Sell/Possess"], ["1205", "Theft by Lessee - Non Motor Vehicle"], ["1206", "Theft by Lessee - Motor Vehicle"], ["1210", "Theft of Labor - Service, Use of Property"], ["1220", "Theft of Mislaid Property"], ["1230", "Possession of Key Device to Coin-Op Machine"], ["1235", "Unlawful use of Recorded Sound"], ["1240", "Unlawful use of Computer"], ["1245", "Cable TV Service Offense"]]}, {"key": "narcotics", "title": "Narcotics", "codes": [["1811", "Poss: Cannabis 30 grms or less"], ["1812", "Poss: Cannabis more than 30 grms"], ["1821", "Delv: Cannabis 10 grms or less"], ["1822", "Delv: Cannabis over 10 grms"], ["2010", "Delv: Amphetamine"], ["2012", "Delv: Cocaine"], ["2013", "Delv: Heroin (Tan)"], ["2014", "Delv: Heroin (White)"], ["2015", "Delv: Hallucinogens"], ["2016", "Delv: PCP"], ["2017", "Delv: Crack Cocaine"], ["2018", "Delv: Synthetic Drugs"], ["2020", "Poss: Amphetamine"], ["2022", "Poss: Cocaine"], ["2023", "Poss: Heroin (Tan)"], ["2024", "Poss: Heroin (White)"], ["2025", "Poss: Hallucinogens"], ["2026", "Poss: PCP"], ["2027", "Poss: Crack Cocaine"], ["2028", "Poss: Synthetic Drugs"], ["2031", "Poss: Methamphetamine"], ["2032", "Delv: Methamphetamine"], ["2091", "Forfiet Property: Narcotics"], ["2095", "Found Property: Narcotics"]]}, {"key": "other", "title": "Other", "codes": [["5084", "Death"], ["5078", "Death Investigation"], ["5088", "Injury On Duty"], ["5079", "Mental Transport"], ["5080", "Non Criminal"], ["5105", "Narcan"]]}, {"key": "theft", "title": "Theft", "codes": [["0810", "Over $500"], ["0820", "$500 and Under"], ["0860", "Other Theft/Retail"]]}, {"key": "weapons-violation", "title": "Weapons Violation", "codes": [["141A", "UUW: Handgun"], ["141B", "UUW: Other Firearm"], ["141C", "UUW: Other Dangerous Weapon"], ["142A", "Unlawful Sale: Handgun"], ["142B", "Unlawful Sale: Other Firearm"], ["143A", "Unlawful Possession: Handgun"], ["143B", "Unlawful Possession: Other Firearm"], ["143C", "Unlawful Possession: Ammunition"], ["1440", "Register of Sales by Dealer"], ["1450", "Defacing Identifying Marks on Firearm"], ["1460", "Fire Arms and Ammunition, No FOID Card"]]}];

  const api = { NARCOTIC_SOURCE, NARCOTIC_CATEGORIES, NARCOTIC_DATA, LOCATION_CODES, UCR_CODES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVRefData = api;
})(this);
