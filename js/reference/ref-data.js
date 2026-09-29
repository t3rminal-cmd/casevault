/* CaseVault — reference data: narcotics street values, Cook County narcotic complaint forms,
 * the SFST checklist, the DUI flow chart, incident location codes and commonly used UCR codes.
 *
 * Taken from LE Cyber-Docs (t3rminal-cmd/LE-CyberDocs on GitHub, MIT). It is a quick
 * reference only: follow your department's policies, and have charging documents reviewed by
 * your ASA or supervisor.
 *
 * The complaint PDFs themselves are not in this repository: they are agency forms, so they are
 * imported onto the SSD (CaseVault-Data\reference\complaints) from the LE Cyber-Docs folder.
 * Only their file names, citations, weight ranges and classes are listed here.
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

  /* ---------- Narcotic complaint forms (CCCR 0662) ---------- */
  // grams: [from, below] (below null = no upper limit), for picking the form from a weight.
  const COMPLAINTS = {
    "hint": "Cook County felony complaint forms (CCCR 0662). Classes are a quick reference; confirm charges with your ASA.",
    "groups": [
      {
        "key": "cocaine",
        "drug": "Cocaine & Crack",
        "act": "720 ILCS 570 (Controlled Substances Act)",
        "notes": [],
        "subs": [
          {
            "kind": "possession",
            "forms": [
              {
                "cite": "570/402(c)",
                "range": "Less than 15 g",
                "cls": "Class 4",
                "file": "possession/POSS_402-C_Cocaine_00-15grms.pdf",
                "grams": [
                  0,
                  15.0
                ]
              },
              {
                "cite": "570/402(a)(2)(A)",
                "range": "15-100 g",
                "cls": "Class 1 (4-15 yrs)",
                "file": "possession/POSS_402-A-2-A_Cocaine_15-100grms.pdf",
                "grams": [
                  15.0,
                  100.0
                ]
              },
              {
                "cite": "570/402(a)(2)(B)",
                "range": "100-400 g",
                "cls": "Class X (6-30 yrs)",
                "file": "possession/POSS_402-A-2-B_Cocaine_100-400grms.pdf",
                "grams": [
                  100.0,
                  400.0
                ]
              },
              {
                "cite": "570/402(a)(2)(C)",
                "range": "400-900 g",
                "cls": "Class X (8-40 yrs)",
                "file": "possession/POSS_402-A-2-C_Cocaine_400-900grms.pdf",
                "grams": [
                  400.0,
                  900.0
                ]
              },
              {
                "cite": "570/402(a)(2)(D)",
                "range": "900+ g",
                "cls": "Class X (10-50 yrs)",
                "file": "possession/POSS_402-A-2-D_Cocaine_900plusgrms.pdf",
                "grams": [
                  900.0,
                  null
                ]
              }
            ]
          },
          {
            "kind": "delivery",
            "forms": [
              {
                "cite": "570/401(d)(i)",
                "range": "Less than 1 g",
                "cls": "Class 2",
                "file": "delivery/DELV_401-D-i_Cocaine_00-01grms.pdf",
                "grams": [
                  0,
                  1.0
                ]
              },
              {
                "cite": "570/401(c)(2)",
                "range": "1-15 g",
                "cls": "Class 1",
                "file": "delivery/DELV_401-C-2_Cocaine_01-15grms.pdf",
                "grams": [
                  1.0,
                  15.0
                ]
              },
              {
                "cite": "570/401(a)(2)(A)",
                "range": "15-100 g",
                "cls": "Class X (6-30 yrs)",
                "file": "delivery/DELV_401-A-2-A_Cocaine_15-100grms.pdf",
                "grams": [
                  15.0,
                  100.0
                ]
              },
              {
                "cite": "570/401(a)(2)(B)",
                "range": "100-400 g",
                "cls": "Class X (9-40 yrs)",
                "file": "delivery/DELV_401-A-2-B_Cocaine_100-400grms.pdf",
                "grams": [
                  100.0,
                  400.0
                ]
              },
              {
                "cite": "570/401(a)(2)(C)",
                "range": "400-900 g",
                "cls": "Class X (12-50 yrs)",
                "file": "delivery/DELV_401-A-2-C_Cocaine_400-900grms.pdf",
                "grams": [
                  400.0,
                  900.0
                ]
              },
              {
                "cite": "570/401(a)(2)(D)",
                "range": "900+ g",
                "cls": "Class X (15-60 yrs)",
                "file": "delivery/DELV_401-A-2-D_Cocaine_900plusgrms.pdf",
                "grams": [
                  900.0,
                  null
                ]
              }
            ]
          }
        ]
      },
      {
        "key": "heroin",
        "drug": "Heroin",
        "act": "720 ILCS 570 (Controlled Substances Act)",
        "notes": [],
        "subs": [
          {
            "kind": "possession",
            "forms": [
              {
                "cite": "570/402(c)",
                "range": "Less than 15 g",
                "cls": "Class 4",
                "file": "possession/POSS_402-C_Heroin_00-15grms.pdf",
                "grams": [
                  0,
                  15.0
                ]
              },
              {
                "cite": "570/402(a)(1)(A)",
                "range": "15-100 g",
                "cls": "Class 1 (4-15 yrs)",
                "file": "possession/POSS_402-A-1-A_Heroin_15-100grms.pdf",
                "grams": [
                  15.0,
                  100.0
                ]
              },
              {
                "cite": "570/402(a)(1)(B)",
                "range": "100-400 g",
                "cls": "Class X (6-30 yrs)",
                "file": "possession/POSS_402-A-1-B_Heroin_100-400grms.pdf",
                "grams": [
                  100.0,
                  400.0
                ]
              },
              {
                "cite": "570/402(a)(1)(C)",
                "range": "400-900 g",
                "cls": "Class X (8-40 yrs)",
                "file": "possession/POSS_402-A-1-C_Heroin_400-900grms.pdf",
                "grams": [
                  400.0,
                  900.0
                ]
              },
              {
                "cite": "570/402(a)(1)(D)",
                "range": "900+ g",
                "cls": "Class X (10-50 yrs)",
                "file": "possession/POSS_402-A-1-D_Heroin_900plusgrms.pdf",
                "grams": [
                  900.0,
                  null
                ]
              }
            ]
          },
          {
            "kind": "delivery",
            "forms": [
              {
                "cite": "570/401(d)(i)",
                "range": "Less than 1 g",
                "cls": "Class 2",
                "file": "delivery/DELV_401-D-i_Heroin_00-01grms.pdf",
                "grams": [
                  0,
                  1.0
                ]
              },
              {
                "cite": "570/401(c)(1)",
                "range": "1-15 g",
                "cls": "Class 1",
                "file": "delivery/DELV_401-C-1_Heroin_01-15grms.pdf",
                "grams": [
                  1.0,
                  15.0
                ]
              },
              {
                "cite": "570/401(a)(1)(A)",
                "range": "15-100 g",
                "cls": "Class X (6-30 yrs)",
                "file": "delivery/DELV_401-A-1-A_Heroin_15-100grms.pdf",
                "grams": [
                  15.0,
                  100.0
                ]
              },
              {
                "cite": "570/401(a)(1)(B)",
                "range": "100-400 g",
                "cls": "Class X (9-40 yrs)",
                "file": "delivery/DELV_401-A-1-B_Heroin_100-400grms.pdf",
                "grams": [
                  100.0,
                  400.0
                ]
              },
              {
                "cite": "570/401(a)(1)(C)",
                "range": "400-900 g",
                "cls": "Class X (12-50 yrs)",
                "file": "delivery/DELV_401-A-1-C_Heroin_400-900grms.pdf",
                "grams": [
                  400.0,
                  900.0
                ]
              },
              {
                "cite": "570/401(a)(1)(D)",
                "range": "900+ g",
                "cls": "Class X (15-60 yrs)",
                "file": "delivery/DELV_401-A-1-D_Heroin_900plusgrms.pdf",
                "grams": [
                  900.0,
                  null
                ]
              }
            ]
          }
        ]
      },
      {
        "key": "fentanyl",
        "drug": "Fentanyl",
        "act": "720 ILCS 570 (Controlled Substances Act)",
        "notes": [
          "Delivery: any amount containing fentanyl adds 3 years to the sentence and raises the maximum by 3 years (720 ILCS 570/401).",
          "Possession of 15 g or more: confirm the subsection with your ASA; no form yet."
        ],
        "subs": [
          {
            "kind": "possession",
            "forms": [
              {
                "cite": "570/402(c)",
                "range": "Less than 15 g",
                "cls": "Class 4",
                "file": "possession/POSS_402-C_Fentanyl_00-15grms.pdf",
                "grams": [
                  0,
                  15.0
                ]
              }
            ]
          },
          {
            "kind": "delivery",
            "forms": [
              {
                "cite": "570/401(d)(iii)",
                "range": "Less than 1 g",
                "cls": "Class 2",
                "file": "delivery/DELV_401-D-iii_Fentanyl_00-01grms.pdf",
                "grams": [
                  0,
                  1.0
                ]
              },
              {
                "cite": "570/401(c)(1.5)",
                "range": "1-15 g",
                "cls": "Class 1",
                "file": "delivery/DELV_401-C-1.5_Fentanyl_01-15grms.pdf",
                "grams": [
                  1.0,
                  15.0
                ]
              },
              {
                "cite": "570/401(a)(1.5)(A)",
                "range": "15-100 g",
                "cls": "Class X (6-30 yrs)",
                "file": "delivery/DELV_401-A-1.5-A_Fentanyl_15-100grms.pdf",
                "grams": [
                  15.0,
                  100.0
                ]
              },
              {
                "cite": "570/401(a)(1.5)(B)",
                "range": "100-400 g",
                "cls": "Class X (9-40 yrs)",
                "file": "delivery/DELV_401-A-1.5-B_Fentanyl_100-400grms.pdf",
                "grams": [
                  100.0,
                  400.0
                ]
              },
              {
                "cite": "570/401(a)(1.5)(C)",
                "range": "400-900 g",
                "cls": "Class X (12-50 yrs)",
                "file": "delivery/DELV_401-A-1.5-C_Fentanyl_400-900grms.pdf",
                "grams": [
                  400.0,
                  900.0
                ]
              },
              {
                "cite": "570/401(a)(1.5)(D)",
                "range": "900+ g",
                "cls": "Class X (15-60 yrs)",
                "file": "delivery/DELV_401-A-1.5-D_Fentanyl_900plusgrms.pdf",
                "grams": [
                  900.0,
                  null
                ]
              }
            ]
          }
        ]
      },
      {
        "key": "methamphetamine",
        "drug": "Methamphetamine",
        "act": "720 ILCS 646 (Methamphetamine Control and Community Protection Act)",
        "notes": [],
        "subs": [
          {
            "kind": "possession",
            "forms": [
              {
                "cite": "646/60(b)(1)",
                "range": "Less than 5 g",
                "cls": "Class 3",
                "file": "possession/POSS_60-B-1_Methamphetamine_00-05grms.pdf",
                "grams": [
                  0,
                  5.0
                ]
              },
              {
                "cite": "646/60(b)(2)",
                "range": "5-15 g",
                "cls": "Class 2",
                "file": "possession/POSS_60-B-2_Methamphetamine_05-15grms.pdf",
                "grams": [
                  5.0,
                  15.0
                ]
              },
              {
                "cite": "646/60(b)(3)",
                "range": "15-100 g",
                "cls": "Class 1",
                "file": "possession/POSS_60-B-3_Methamphetamine_15-100grms.pdf",
                "grams": [
                  15.0,
                  100.0
                ]
              },
              {
                "cite": "646/60(b)(4)",
                "range": "100-400 g",
                "cls": "Class X (6-30 yrs)",
                "file": "possession/POSS_60-B-4_Methamphetamine_100-400grms.pdf",
                "grams": [
                  100.0,
                  400.0
                ]
              },
              {
                "cite": "646/60(b)(5)",
                "range": "400-900 g",
                "cls": "Class X (8-40 yrs)",
                "file": "possession/POSS_60-B-5_Methamphetamine_400-900grms.pdf",
                "grams": [
                  400.0,
                  900.0
                ]
              },
              {
                "cite": "646/60(b)(6)",
                "range": "900+ g",
                "cls": "Class X (10-50 yrs)",
                "file": "possession/POSS_60-B-6_Methamphetamine_900plusgrms.pdf",
                "grams": [
                  900.0,
                  null
                ]
              }
            ]
          },
          {
            "kind": "delivery",
            "forms": [
              {
                "cite": "646/55(a)(2)(A)",
                "range": "Less than 5 g",
                "cls": "Class 2",
                "file": "delivery/DELV_55-A-2-A_Methamphetamine_00-05grms.pdf",
                "grams": [
                  0,
                  5.0
                ]
              },
              {
                "cite": "646/55(a)(2)(B)",
                "range": "5-15 g",
                "cls": "Class 1",
                "file": "delivery/DELV_55-A-2-B_Methamphetamine_05-15grms.pdf",
                "grams": [
                  5.0,
                  15.0
                ]
              },
              {
                "cite": "646/55(a)(2)(C)",
                "range": "15-100 g",
                "cls": "Class X (6-30 yrs)",
                "file": "delivery/DELV_55-A-2-C_Methamphetamine_15-100grms.pdf",
                "grams": [
                  15.0,
                  100.0
                ]
              },
              {
                "cite": "646/55(a)(2)(D)",
                "range": "100-400 g",
                "cls": "Class X (9-40 yrs)",
                "file": "delivery/DELV_55-A-2-D_Methamphetamine_100-400grms.pdf",
                "grams": [
                  100.0,
                  400.0
                ]
              },
              {
                "cite": "646/55(a)(2)(E)",
                "range": "400-900 g",
                "cls": "Class X (12-50 yrs)",
                "file": "delivery/DELV_55-A-2-E_Methamphetamine_400-900grms.pdf",
                "grams": [
                  400.0,
                  900.0
                ]
              },
              {
                "cite": "646/55(a)(2)(F)",
                "range": "900+ g",
                "cls": "Class X (15-60 yrs)",
                "file": "delivery/DELV_55-A-2-F_Methamphetamine_900plusgrms.pdf",
                "grams": [
                  900.0,
                  null
                ]
              }
            ]
          }
        ]
      },
      {
        "key": "synthetic",
        "drug": "Synthetic Drugs",
        "act": "720 ILCS 570 (Controlled Substances Act)",
        "notes": [
          "Fill in the drug name on the form."
        ],
        "subs": [
          {
            "kind": "possession",
            "forms": [
              {
                "cite": "570/402",
                "range": "Any amount",
                "cls": "See 402",
                "file": "possession/POSS_402_SyntheticDrug.pdf",
                "grams": null
              }
            ]
          },
          {
            "kind": "delivery",
            "forms": [
              {
                "cite": "570/401",
                "range": "Any amount",
                "cls": "See 401",
                "file": "delivery/DELV_401_SyntheticDrug.pdf",
                "grams": null
              }
            ]
          }
        ]
      },
      {
        "key": "cannabis",
        "drug": "Cannabis",
        "act": "720 ILCS 550 (Cannabis Control Act)",
        "notes": [
          "Possession within the Cannabis Regulation and Tax Act limits is legal for adults 21+."
        ],
        "subs": [
          {
            "kind": "possession",
            "forms": [
              {
                "cite": "550/4(c)",
                "range": "30-100 g",
                "cls": "Class A misd. (Class 4 with prior)Felony only with a prior",
                "file": "possession/POSS_04-C_30-100grms.pdf",
                "grams": [
                  30.0,
                  100.0
                ]
              },
              {
                "cite": "550/4(d)",
                "range": "100-500 g",
                "cls": "Class 4 (Class 3 with prior)",
                "file": "possession/POSS_04-D_100-500grms.pdf",
                "grams": [
                  100.0,
                  500.0
                ]
              },
              {
                "cite": "550/4(e)",
                "range": "500-2000 g",
                "cls": "Class 3",
                "file": "possession/POSS_04-E_500-2000grms.pdf",
                "grams": [
                  500.0,
                  2000.0
                ]
              },
              {
                "cite": "550/4(f)",
                "range": "2000-5000 g",
                "cls": "Class 2",
                "file": "possession/POSS_04-F_2000-5000grms.pdf",
                "grams": [
                  2000.0,
                  5000.0
                ]
              },
              {
                "cite": "550/4(g)",
                "range": "5000+ g",
                "cls": "Class 1",
                "file": "possession/POSS_04-G_5000+grms.pdf",
                "grams": [
                  5000.0,
                  null
                ]
              }
            ]
          },
          {
            "kind": "delivery",
            "forms": [
              {
                "cite": "550/5(c)",
                "range": "10-30 g",
                "cls": "Class 4",
                "file": "delivery/DELV_05-C_10-30grms.pdf",
                "grams": [
                  10.0,
                  30.0
                ]
              },
              {
                "cite": "550/5(d)",
                "range": "30-500 g",
                "cls": "Class 3",
                "file": "delivery/DELV_05-D_30-500grms.pdf",
                "grams": [
                  30.0,
                  500.0
                ]
              },
              {
                "cite": "550/5(e)",
                "range": "500-2000 g",
                "cls": "Class 2",
                "file": "delivery/DELV_05-E_500-2000grms.pdf",
                "grams": [
                  500.0,
                  2000.0
                ]
              },
              {
                "cite": "550/5(f)",
                "range": "2000-5000 g",
                "cls": "Class 1",
                "file": "delivery/DELV_05-F_2000-5000grms.pdf",
                "grams": [
                  2000.0,
                  5000.0
                ]
              },
              {
                "cite": "550/5(g)",
                "range": "5000+ g",
                "cls": "Class X (6-30 yrs)",
                "file": "delivery/DELV_05-G_5000+grms.pdf",
                "grams": [
                  5000.0,
                  null
                ]
              }
            ]
          }
        ]
      }
    ],
    "other": [
      [
        "Felony 101",
        "other/Form_101.pdf"
      ],
      [
        "Felony blank",
        "other/FELONY_BLANK.pdf"
      ]
    ]
  };

  /* ---------- Standardized Field Sobriety Test ---------- */
  const SFST = [
    {
      key: 'hgn', title: 'Phase I: Horizontal Gaze Nystagmus', max: 6, decision: 4,
      stages: [
        { title: 'Instructions', steps: ['Are you wearing glasses/contacts?', 'I\'m going to check your eyes.', 'Stand feet together, hands to side.', 'Head still, follow stimulus with eyes only.', 'Hold stimulus 12-15 inch from face.'] },
        { title: 'Medical check (both eyes)', sided: true, steps: ['Equal pupil size', 'Resting nystagmus', 'Equal tracking'] },
      ],
      clues: ['Lack of smooth pursuit', 'Distinct & sustained nystagmus at maximum deviation', 'Onset of nystagmus prior to 45 degrees'],
      sidedClues: true,
      extra: { key: 'vgn', label: 'Vertical gaze nystagmus', options: ['Yes', 'No'] },
    },
    {
      key: 'wat', title: 'Phase II: Walk and Turn', max: 8, decision: 2,
      stages: [
        { title: 'Instruction stage', steps: ['Place your left foot on the line.', 'Place your arms down at your sides.', 'Maintain this position until the instructions are complete.', 'Follow my instructions carefully.', 'Do you understand? (verbal response)'] },
        { title: 'Walking stage', steps: ['Take 9 heel-to-toe steps on the line, turn, and take 9 heel-to-toe steps back.', 'On the turn, keep the front foot on the line and turn by taking small steps with the other foot.', 'Count each step out loud.', 'Keep your arms at your sides.', 'Maintain balance during the entire exercise.'] },
      ],
      clues: ['Can\'t balance during instructions', 'Starts too soon', 'Stops while walking', 'Misses heel to toe', 'Steps off line', 'Uses arms to balance', 'Turned improperly', 'Wrong number of steps'],
      cantPerform: 'Can\'t perform (stop for the subject\'s safety)',
    },
    {
      key: 'ols', title: 'Phase III: One-Leg Stand', max: 4, decision: 2,
      stages: [
        { title: 'Instruction stage', steps: ['Stand with your feet together and arms down at your sides.', 'Maintain this position until I finish the instructions.', 'Do you understand? (verbal response)'] },
        { title: 'Balance and counting stage', steps: ['Raise one leg approximately six inches off the ground.', 'Keep both legs straight, with the raised foot parallel to the ground.', 'Count out loud by thousands until told to stop.'] },
      ],
      clues: ['Sways while balancing', 'Uses arms to balance', 'Hops to maintain balance', 'Puts the raised foot down'],
      cantPerform: 'Can\'t perform (stop for the subject\'s safety)',
    },
  ];
  const SFST_ALTERNATE = ['Alphabet test', 'Finger count (1-4, 4-1)', 'Count backwards from 68 to 53', 'Nose touch', 'PBT (preliminary breath test)'];

  /* ---------- DUI flow chart ---------- */
  // Each phase: fields (text, time, select, choice) and where a choice leads.
  const DUI_FLOW = [
    { key: 'p1', title: 'Phase I: Vehicle in motion', lead: 'Curb the vehicle. Observe the driver, the location and the number of occupants.',
      fields: [
        { key: 'driver', label: 'Driver observation', type: 'select', options: ['', 'Alert', 'Sleepy', 'Glossy eyes', 'Laughing', 'Combative'] },
        { key: 'driverOther', label: 'Other observations', type: 'text' },
        { key: 'stopTime', label: 'Time of stop', type: 'time' },
        { key: 'stopPlace', label: 'Address of stop', type: 'text' },
        { key: 'occupants', label: 'Number of occupants', type: 'select', options: ['', '1', '2', '3', '4', '5+'] },
      ] },
    { key: 'p2', title: 'Phase II: Personal contact', lead: 'The driver exits the vehicle. Observe the exit and decide whether SFSTs are needed.',
      fields: [{ key: 'exitObs', label: 'Observations', type: 'text' }] },
    { key: 'p3', title: 'Phase III: Administer SFST', lead: 'Administer the Standardized Field Sobriety Tests (see the SFST checklist).',
      fields: [
        { key: 'sfst', label: 'SFST administered?', type: 'choice', options: ['Yes', 'Refused'] },
        { key: 'sfstTime', label: 'Time administered / refused', type: 'time' },
        { key: 'pc', label: 'Probable cause?', type: 'choice', options: ['Yes', 'No'], next: { Yes: 'p4', No: 'end-release' } },
      ] },
    { key: 'p4', title: 'Phase IV: Arrest and transport', lead: 'Arrest, custodial search of the driver and the vehicle, and transport.',
      fields: [
        { key: 'arrestTime', label: 'Time of arrest', type: 'time' },
        { key: 'transportTime', label: 'Time of transport', type: 'time' },
        { key: 'warningTime', label: 'Warning to Motorist read verbatim at', type: 'time' },
      ] },
    { key: 'p5', title: 'Phase V: Testing', lead: 'Does the driver submit to testing?',
      fields: [{ key: 'submits', label: 'Submits to testing?', type: 'choice', options: ['Yes', 'No'], next: { Yes: 'p6', No: 'p8' } }] },
    { key: 'p6', title: 'Phase VI: Breath analysis', lead: '20-minute observation period, then the breath test.',
      fields: [
        { key: 'obsStart', label: '20-minute observation started', type: 'time' },
        { key: 'breathTime', label: 'Breath test time', type: 'time' },
        { key: 'bac', label: 'Blood alcohol content', type: 'choice', options: ['0.08 or above', 'Under 0.08'], next: { '0.08 or above': 'p8', 'Under 0.08': 'p7' } },
        { key: 'bacValue', label: 'Result', type: 'text' },
      ] },
    { key: 'p7', title: 'Phase VII: Alternate testing', lead: 'Under 0.08 but impaired: blood/urine testing for drugs.',
      fields: [
        { key: 'hospitalTime', label: 'Time to hospital', type: 'time' },
        { key: 'testTime', label: 'Time of testing', type: 'time' },
        { key: 'tester', label: 'Person administering the test', type: 'text' },
        { key: 'forensicTime', label: 'Hand carried to forensic services', type: 'time' },
        { key: 'mailTime', label: 'Hand carried to the mail room', type: 'time' },
      ] },
    { key: 'p8', title: 'Phase VIII: Finish the arrest', lead: 'Paperwork and processing.',
      checklist: ['DL check / abstract', 'SOS / LEADS', 'Felony upgradable?', 'Sworn report', 'Miranda warning', 'Alcohol influence report and interview', 'Issue citations (21-49 days)', 'Complete arrest report', 'Tow report and notice of vehicle impounded', 'Watch commander approval', 'Search arrestee', 'Lock-up', 'Notify the administrative desk', 'Issue bond', 'Release'],
      fields: [
        { key: 'mirandaTime', label: 'Time of Miranda', type: 'time' },
        { key: 'airTime', label: 'Alcohol influence report', type: 'time' },
        { key: 'releaseTime', label: 'Time of release', type: 'time' },
      ] },
  ];
  const DUI_ENDS = { 'end-release': 'No probable cause: issue a citation, post bond, or release.' };

  /* ---------- Incident location codes and commonly used UCR codes ---------- */
  const LOCATION_CODES = [{"key": "business-commercial", "title": "Business/Commercial", "codes": [["097", "Appliance Store"], ["206", "Athletic Club"], ["103", "Bar/Tavern"], ["167", "Barber/Beauty Shop"], ["109", "Bowling Alley"], ["140", "Commercial/Business Office"], ["144", "Car Wash"], ["192", "Cleaning Store"], ["160", "Coin Op Machine"], ["161", "Pawn Shop"], ["162", "Convenience Store"], ["174", "Dept Store"], ["193", "Drug Store"], ["209", "Factory/Man Building"], ["220", "Gas Station"], ["221", "Grocery/Food Store"], ["260", "Hotel/Motel"], ["267", "Movie Theater"], ["165", "Newstand"], ["277", "Parking Lot/Garage"], ["166", "Pool Room"], ["293", "Restaurant"], ["261", "Small Retail Store"], ["305", "Sports Arena"], ["327", "Warehouse"], ["280", "Police Facility/Vehicle/Lot"]]}, {"key": "financial-institution", "title": "Financial Institution", "codes": [["100", "Bank"], ["175", "Credit Union"], ["168", "Currency Exchange"], ["298", "Savings and Loan"], ["164", "ATM"]]}, {"key": "medical", "title": "Medical", "codes": [["230", "Animal Hospital/Vet Clinic"], ["233", "Hospital Building/Grounds"], ["250", "Medical/Dental Office"], ["268", "Nursing Home"]]}, {"key": "miscellaneous", "title": "Miscellaneous", "codes": [["096", "Abandoned Building"], ["145", "Cemetery"], ["151", "Church/Synagogue/Place of Worship"], ["171", "Construction Site"], ["200", "Vacant Lot/Land"]]}, {"key": "public-building-property-way", "title": "Public Building/Property/Way", "codes": [["092", "Alley"], ["132", "Bridge"], ["284", "Federal Building"], ["212", "Fire Station"], ["270", "Forest Preserve"], ["292", "Government Building/Property"], ["238", "Highway/Expressway"], ["273", "Lake/Waterway/Riverbank"], ["245", "Library"], ["269", "Park Property"], ["281", "Jail/Lock-Up Facility"], ["303", "Sidewalk"], ["304", "Street"]]}, {"key": "residential-public-private", "title": "Residential Public & Private", "codes": [["909", "Apartment"], ["121", "CHA Apartment"], ["122", "CHA Hallway/Elevator/Stairwell"], ["123", "CHA Parking Lot/Grounds"], ["290", "Residence"], ["176", "Residence - Driveway"], ["210", "Residence - Garage"], ["289", "Residence - Porch/Hallway"], ["291", "Residence - Yard (Front/Back)"]]}, {"key": "transportation", "title": "Transportation", "codes": [["095", "Airport/Aircraft"], ["104", "Boat/Watercraft"], ["119", "CTA"], ["322", "CTA-Parking Lot/Garage/Other Property"], ["220", "Gas Station"], ["323", "CTA Platform"], ["321", "CTA Train"], ["317", "Other Railroad Property/Train Depot"], ["309", "Taxicab"], ["262", "Vehicle Commercial"], ["126", "Vehicle Delivery Truck"], ["259", "Vehicle Non-Commercial"], ["257", "Other Commercial Trans"]]}, {"key": "school-univ-child-care", "title": "School/Univ/Child Care", "codes": [["169", "College/University Building/Grounds"], ["170", "College/University Residence Hall"], ["177", "Day Care Center"], ["313", "School Private Building"], ["299", "School Private Grounds"], ["314", "School Public Building"], ["300", "School Public Grounds"]]}, {"key": "other-location-not-listed", "title": "Other Location Not Listed", "codes": [["330", "OTHER (SPECIFY)"]]}];
  const UCR_CODES = [{"key": "arson-explosives", "title": "Arson/Explosives", "codes": [["1010", "By Explosive"], ["1020", "By Incendiary Device"], ["1025", "Agg: Arson"], ["1030", "Possession: Explosives, Incendiary Device"], ["1090", "Attempt Arson"]]}, {"key": "assault", "title": "Assault", "codes": [["051A", "Agg: Handgun"], ["051B", "Agg: Other Firearm"], ["0520", "Agg: Knife or Cutting Instrument"], ["0530", "Agg: Other Dangerous Weapon"], ["0560", "Simple Assault"], ["0580", "Stalking-Simple"], ["0581", "Stalking-Aggravated"]]}, {"key": "battery", "title": "Battery", "codes": [["041A", "Agg: Handgun"], ["041B", "Agg: Other Firearm"], ["0420", "Agg: Knife or Cutting Instrument"], ["0430", "Agg: Other Dangerous Weapon"], ["0440", "Agg: Hands, Fist, Feet"], ["0460", "Simple Battery"], ["0486", "Battery/Domestic-Simple"]]}, {"key": "burglary", "title": "Burglary", "codes": [["0610", "Forcible Entry"], ["0620", "Unlawful Entry, No Force"], ["0630", "Attempt: Forcible Entry"]]}, {"key": "criminal-damage-trespass-to-property", "title": "Criminal Damage & Trespass to Property", "codes": [["1310", "Criminal Damage to Property"], ["1320", "Criminal Damage to Vehicle"], ["1330", "Criminal Trespass to Land"], ["1340", "Criminal Damage to State-Supported Land"], ["1350", "Criminal Trespass to State-Supported Land"], ["1360", "Criminal Trespass to Vehicle"], ["1365", "Criminal Trespass to Residence"], ["1370", "Criminal Damage to Firefighting Apparatus, Hydrants, or Equipment"]]}, {"key": "deception", "title": "Deception", "codes": [["1130", "Fraud"], ["1140", "Embezzlement"], ["1150", "Credit Card, Illegal Use"], ["1151", "Cash Dispensing Card, Illegal Use"], ["1200", "Stolen Property: Buy/Sell/Possess"], ["1205", "Theft by Lessee - Non Motor Vehicle"], ["1206", "Theft by Lessee - Motor Vehicle"], ["1210", "Theft of Labor - Service, Use of Property"], ["1220", "Theft of Mislaid Property"], ["1230", "Possession of Key Device to Coin-Op Machine"], ["1235", "Unlawful use of Recorded Sound"], ["1240", "Unlawful use of Computer"], ["1245", "Cable TV Service Offense"]]}, {"key": "narcotics", "title": "Narcotics", "codes": [["1811", "Poss: Cannabis 30 grms or less"], ["1812", "Poss: Cannabis more than 30 grms"], ["1821", "Delv: Cannabis 10 grms or less"], ["1822", "Delv: Cannabis over 10 grms"], ["2010", "Delv: Amphetamine"], ["2012", "Delv: Cocaine"], ["2013", "Delv: Heroin (Tan)"], ["2014", "Delv: Heroin (White)"], ["2015", "Delv: Hallucinogens"], ["2016", "Delv: PCP"], ["2017", "Delv: Crack Cocaine"], ["2018", "Delv: Synthetic Drugs"], ["2020", "Poss: Amphetamine"], ["2022", "Poss: Cocaine"], ["2023", "Poss: Heroin (Tan)"], ["2024", "Poss: Heroin (White)"], ["2025", "Poss: Hallucinogens"], ["2026", "Poss: PCP"], ["2027", "Poss: Crack Cocaine"], ["2028", "Poss: Synthetic Drugs"], ["2031", "Poss: Methamphetamine"], ["2032", "Delv: Methamphetamine"], ["2091", "Forfiet Property: Narcotics"], ["2095", "Found Property: Narcotics"]]}, {"key": "other", "title": "Other", "codes": [["5084", "Death"], ["5078", "Death Investigation"], ["5088", "Injury On Duty"], ["5079", "Mental Transport"], ["5080", "Non Criminal"], ["5105", "Narcan"]]}, {"key": "theft", "title": "Theft", "codes": [["0810", "Over $500"], ["0820", "$500 and Under"], ["0860", "Other Theft/Retail"]]}, {"key": "weapons-violation", "title": "Weapons Violation", "codes": [["141A", "UUW: Handgun"], ["141B", "UUW: Other Firearm"], ["141C", "UUW: Other Dangerous Weapon"], ["142A", "Unlawful Sale: Handgun"], ["142B", "Unlawful Sale: Other Firearm"], ["143A", "Unlawful Possession: Handgun"], ["143B", "Unlawful Possession: Other Firearm"], ["143C", "Unlawful Possession: Ammunition"], ["1440", "Register of Sales by Dealer"], ["1450", "Defacing Identifying Marks on Firearm"], ["1460", "Fire Arms and Ammunition, No FOID Card"]]}];

  const api = { NARCOTIC_SOURCE, NARCOTIC_CATEGORIES, NARCOTIC_DATA, COMPLAINTS, SFST, SFST_ALTERNATE, DUI_FLOW, DUI_ENDS, LOCATION_CODES, UCR_CODES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CVRefData = api;
})(this);
