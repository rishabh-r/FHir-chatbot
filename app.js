/* =====================================================
   CareBridge – Clinical AI Chatbot
   OpenAI GPT-5 + FHIR R4 API Integration
===================================================== */

// ── Config ──────────────────────────────────────────
// OpenAI API key is stored in localStorage (entered by user on first run)
// Never hardcode API keys in source code
let OPENAI_API_KEY = localStorage.getItem("cb_oai_key") || "";
const OPENAI_MODEL   = "gpt-4.1";
const FHIR_BASE      = "https://fhirassist.rsystems.com:481";
const LOGIN_URL      = `${FHIR_BASE}/auth/login`;

// ── State ────────────────────────────────────────────
let conversationHistory = [];
let userName = "";
let userInitial = "U";

// ── Knowledge Bases (embedded) ───────────────────────
const CONDITION_CODES = `
CONDITION ICD-9 CODES:
0064=Amebic lung abscess, 00845=Int inf clstrdium dfcile, 01736=TB of eye-oth test, 01744=TB of ear-cult dx,
01786=TB esophagus-oth test, 0380=Streptococcal septicemia, 03819=Staphylcocc septicem NEC, 0383=Anaerobic septicemia,
03849=Gram-neg septicemia NEC, 0389=Septicemia NOS, 04102=Streptococcus group b, 07030=Hpt B acte wo cm wo dlta,
07054=Chrnc hpt C wo hpat coma, 1628=Mal neo bronch/lung NEC, 1970=Secondary malig neo lung, 1976=Sec mal neo peritoneum,
1977=Second malig neo liver, 1980=Second malig neo kidney, 1987=Second malig neo adrenal, 20020=Brkt tmr unsp xtrndl org,
20280=Oth lymp unsp xtrndl org, 2273=Benign neo pituitary, 2380=Unc behav neo bone, 2449=Hypothyroidism NOS,
25000=DMII wo cmp nt st uncntr, 25062=DMII neuro uncntrld, 2530=Acromegaly and gigantism, 2720=Pure hypercholesterolem,
2724=Hyperlipidemia NEC/NOS, 2749=Gout NOS, 2760=Hyperosmolality, 2761=Hyposmolality, 2851=Ac posthemorrhag anemia,
28522=Anemia in neoplastic dis, 28529=Anemia-other chronic dis, 2859=Anemia NOS, 2875=Thrombocytopenia NOS,
28959=Spleen disease NEC, 2948=Mental disor NEC oth dis, 30390=Alcoh dep NEC/NOS-unspec, 30401=Opioid dependence-contin,
3051=Tobacco use disorder, 311=Depressive disorder NEC, 3361=Vascular myelopathies, 34401=Quadrplg c1-c4 complete,
3569=Idio periph neurpthy NOS, 3970=Tricuspid valve disease, 4010=Malignant hypertension, 4019=Hypertension NOS,
40390=Hy kid NOS w cr kid I-IV, 40391=Hyp kid NOS w cr kid V, 41071=Subendo infarct initial, 412=Old myocardial infarct,
41400=Cor ath unsp vsl ntv/gft, 41401=Crnry athrscl natve vssl, 41511=Iatrogen pulm emb/infarc, 4168=Chr pulmon heart dis NEC,
4240=Mitral valve disorder, 4241=Aortic valve disorder, 4266=Other heart block, 4271=Parox ventric tachycard,
42731=Atrial fibrillation, 42781=Sinoatrial node dysfunct, 4280=CHF NOS, 42822=Chr systolic hrt failure,
42830=Diastolc hrt failure NOS, 431=Intracerebral hemorrhage, 43310=Ocl crtd art wo infrct, 43889=Late effect CV dis NEC,
4439=Periph vascular dis NOS, 44422=Lower extremity embolism, 486=Pneumonia organism NOS, 4928=Emphysema NEC,
49390=Asthma NOS, 5070=Food/vomit pneumonitis, 5119=Pleural effusion NOS, 5121=Iatrogenic pneumothorax,
51881=Acute respiratry failure, 51882=Other pulmonary insuff, 53551=Gstr/ddnts NOS w hmrhg, 56211=Dvrtcli colon w/o hmrhg,
56409=Constipation NEC, 56881=Hemoperitoneum, 5691=Rectal prolapse, 570=Acute necrosis of liver, 5711=Ac alcoholic hepatitis,
5722=Hepatic encephalopathy, 57451=Choledochlith NOS w obst, 5750=Acute cholecystitis, 5761=Cholangitis,
5762=Obstruction of bile duct, 5781=Blood in stool, 5845=Ac kidny fail tubr necr, 5849=Acute kidney failure NOS,
5854=Chr kidney dis stage IV, 5856=End stage renal disease, 5859=Chronic kidney dis NOS, 5939=Renal & ureteral dis NOS,
5990=Urin tract infection NOS, 6826=Cellulitis of leg, 70703=Pressure ulcer low back, 70714=Ulcer of heel & midfoot,
7211=Cerv spondyl w myelopath, 7850=Tachycardia NOS, 78551=Cardiogenic shock, 78552=Septic shock, 78559=Shock w/o trauma NEC,
79092=Abnrml coagultion prfile, 80102=Cl skul base fx-brf coma, 8024=Fx malar/maxillary-close, 80375=Opn skl fx NEC-deep coma,
80601=C1-c4 fx-cl/com cord les, 82101=Fx femur shaft-closed, 87349=Open wound of face NEC, 99591=Sepsis, 99592=Severe sepsis,
99659=Malfunc oth device/graft, 99662=React-oth vasc dev/graft, 99673=Comp-ren dialys dev/grft, 99812=Hematoma complic proc,
99813=Seroma complicting proc, E8120=Mv collision NOS-driver, E8231=Oth coll stndng obj-psgr, E8495=Accid on street/highway,
E8788=Abn react-surg proc NEC, E8791=Abn react-renal dialysis, E8859=Fall from slipping NEC, E8889=Fall NOS,
E9342=Adv eff anticoagulants, V090=Inf mcrg rstn pncllins, V103=Hx of breast malignancy, V1251=Hx-ven thrombosis/embols,
V1259=Hx-circulatory dis NEC, V1582=History of tobacco use, V1588=Personal history of fall, V440=Tracheostomy status,
V5861=Long-term use anticoagul, V5867=Long-term use of insulin, V8741=Hx antineoplastic chemo
`;

const DRUG_CODES = `
DRUG CODES (pass as CODE param to search_patient_medications):
ACET20/4I, ACET325, ADAL60, ALBU25, ALTE1I, AMBI5, AMID200, APAP500, ARTI3.5O, ASA325, ASA81EC,
ATOR10, ATOR20, BISA10R, CALC500, CALG1I, CEFA10I, CEFX1F, CEPH500, CIPR250, CIPR500, CISA10I,
CLOP75, D5W100, D5W250, D5W50, DEXA4I, DIAZ5, DOBPREM, DOCU100, DOCU100L, DOLA12.5I, DONE5,
DOPA400PM, DRON25, ENAL25I, FURO20, FURO40I, GENT120PM, GENT80PM, GENTBASE1, GENTBASE2, GLAR100I,
GLIP10, GLYCO4I, HEPA100SYR, HEPA5I, HEPAPREMIX, HEPBASE, HEPPREMIX, HYD12.5PCA, HYDR2I, HYDRO4I,
INSULIN, IPRA2H, IPRAPF, KAYE15L, KCL20P, KCL40I, LACT30L, LEV250, LEVO175, LEVO250PM, LEVO4I,
LEVO500PM, LEVOBASE, LISI10, LISI20, LISI5, MAGN400, MAGS1I, MERO500I, METH5, METO25, METO50,
METO5I, METR500, METR500PM, MICROK10, MIDA2I, MOM30L, MORP2I, MORP50PCA, MORPIM, NABC50S,
NACLFLUSH, NAPR250, NEOSI, NEPH1, NESI1.5I, NS100, NS1000, NS250, NTG3SL, OXYC5, PANT40, PANT40I,
PEPC20, PERC, PHEN10I, PHYT10I, PIOG15, PNEU25I, PRAV20, PROC10, PROP100IG, QUET25, RANI150,
SENN187, SEVE800, TIZA4, TRAM50, VANC1F, VENL75XR, VIAL, WARF0, WARF1, WARF2, ZITHR250, ZOSY2.25I
`;

const PROCEDURE_CODES = `
PROCEDURE CPT CODE RANGES:
- Evaluation and Management / Consultations: 99241–99255
- Surgery / Musculoskeletal System: 20000–29999
- Surgery / Respiratory System: 30000–32999
- Surgery / Cardiovascular System: 33010–37799
- Radiology / Diagnostic Ultrasound: 76506–76999
- Medicine / Dialysis: 90935–90999
- Medicine / Cardiovascular: 92950–93799
- Medicine / Pulmonary: 94002–94799
- Evaluation and Management / Hospital Inpatient Services: 99221–99239
- Evaluation and Management / Follow-up Inpatient Consultations: 99261–99263
- Evaluation and Management / Critical Care Services: 99291–99292
- Evaluation and Management / Case Management Services: 99363–99368
`;

const OBSERVATION_RANGES = `
OBSERVATION NORMAL RANGES (parameter: low_cutoff | normal_range | high_cutoff | recommendations):
calculatedBicarbonateWB: Low <22 (metabolic acidosis) | Normal 22-28 | High >28 (metabolic alkalosis)
hemoglobin: Low <13.0 (anemia) | Normal 13.0-17.5 | High >17.5 (polycythemia/dehydration)
lactate: Low <0.5 (impaired metabolic) | Normal 0.5-2.0 | High >2.0 (tissue hypoxia)
oxygenSaturation: Low <95 (hypoxemia) | Normal 95-100 | High >100
pH: Low <7.35 (acidosis) | Normal 7.35-7.45 | High >7.45 (alkalosis)
alanineAminotransferaseALT: Low <7 | Normal 7-56 | High >56 (liver injury/inflammation)
alkalinePhosphatase: Low <44 (malnutrition/bone) | Normal 44-147 | High >147 (liver/bone)
anionGap: Low <3 (hypoalbuminemia) | Normal 3-11 | High >11 (metabolic acidosis)
creatinine: Low <0.6 (low muscle mass) | Normal 0.6-1.3 | High >1.3 (kidney dysfunction)
glucose: Low <70 (hypoglycemia) | Normal 70-99 | High >99 (diabetes/impaired glucose)
acidPhosphataseNonProstatic: Low <0.0 | Normal 0.0-0.8 | High >0.8 (tissue damage/malignancy)
aspartateAminotransferaseAST: Low <10 | Normal 10-40 | High >40 (liver/muscle damage)
beta2Microglobulin: Low <1.0 | Normal 1.0-2.4 | High >2.4 (kidney/immune)
bicarbonate: Low <22 (metabolic acidosis) | Normal 22-28 | High >28 (metabolic alkalosis)
calciumTotal: Low <8.6 (hypocalcemia) | Normal 8.6-10.2 | High >10.2 (hypercalcemia)
calculatedFreeTestosterone: Low <5.0 | Normal 5.0-21.0 | High >21.0 (endocrine)
chloride: Low <96 | Normal 96-106 | High >106 (dehydration/metabolic)
cholesterolRatioTotalHDL: Low <3.5 | Normal 3.5-5.0 | High >5.0 (cardiovascular risk)
cholesterolTotal: Low <125 | Normal 125-200 | High >200 (cardiovascular risk)
creatineKinaseMB: Low <0.0 | Normal 0.0-5.0 | High >5.0 (heart muscle injury)
proteinTotal: Low <6.0 (malnutrition) | Normal 6.0-8.3 | High >8.3 (dehydration/inflammation)
bilirubin/bilirubinTotal: Low <0.2 | Normal 0.2-1.2 | High >1.2 (liver/bile duct)
pO2: Low <80 (hypoxemia) | Normal 80-100 | High >100 (hyperoxia)
pCO2: Low <35 (respiratory alkalosis) | Normal 35-45 | High >45 (respiratory acidosis)
carcinoembryonicAntigenCEA: Low <0.0 | Normal 0.0-3.0 | High >3.0 (malignancy)
ammonia: Low <15 | Normal 15-45 | High >45 (liver dysfunction)
prostateSpecificAntigenPSA: Low <0.0 | Normal 0.0-4.0 | High >4.0 (prostate disorder)
amylase: Low <30 | Normal 30-110 | High >110 (pancreatic disorder)
FEV1: Low <80 (airway obstruction) | Normal 80-120 | High >120
cholesterolHDL: Low <40 (cardiovascular risk) | Normal 40-60 | High >60 (protective)
cholesterolLDLCalculated: Low <70 | Normal 70-130 | High >130 (cardiovascular risk)
creatineKinaseCK: Low <30 | Normal 30-200 | High >200 (muscle injury)
lactateDehydrogenaseLD: Low <140 | Normal 140-280 | High >280 (tissue damage)
magnesium: Low <1.7 (deficiency) | Normal 1.7-2.2 | High >2.2 (kidney/excess intake)
oxygenPartialPressurePaO2: Low <80 (hypoxemia) | Normal 80-100 | High >100 (hyperoxia)
phosphate: Low <2.5 (deficiency) | Normal 2.5-4.5 | High >4.5 (kidney dysfunction)
potassium: Low <3.5 (hypokalemia) | Normal 3.5-5.0 | High >5.0 (hyperkalemia)
sodium: Low <135 (hyponatremia) | Normal 135-145 | High >145 (hypernatremia)
anisocytosis: Normal=None/Mild | High=Moderate-Severe (anemia)
gastrin: Low <25 | Normal 25-100 | High >100 (gastrinoma)
bodyTemperature: Low <36.1 (hypothermia) | Normal 36.1-37.2 | High >37.2 (fever)
diastolicBloodPressure: Low <60 (hypotension) | Normal 60-80 | High >80 (hypertension)
systolicBloodPressure: Low <90 (hypotension) | Normal 90-120 | High >120 (hypertension)
heartRate: Low <60 (bradycardia) | Normal 60-100 | High >100 (tachycardia)
occultBloodStool: Normal=Negative/Trace | High=Positive (GI bleeding)
lipase: Low <13 | Normal 13-60 | High >60 (pancreatitis)
ureaNitrogen: Low <7 (liver/malnutrition) | Normal 7-20 | High >20 (kidney/dehydration)
inhaledOxygenConcentration: Low <21 | Normal 21-100 | High=100 (supplemental O2)
estimatedGFR: Low <60 (reduced kidney function) | Normal 60-120 | High >120
hemoglobinA1c: Low <4.0 | Normal 4.0-5.6 | High >5.6 (diabetes/poor glucose control)
oxygenSaturationArterial: Low <95 (hypoxemia) | Normal 95-100 | High >100
troponinT: Low <0.01 | Normal 0.01-0.04 | High >0.04 (heart muscle injury - urgent)
leukocytesCount: Low <4000 (immune suppression) | Normal 4000-11000 | High >11000 (infection/inflammation)
`;

const LOINC_CODES = `
LOINC CODES AND UNITS:
1. Calculated Bicarbonate WB: 1959-6, mEq/L
2. Hemoglobin: 718-7, mEq/L
3. Lactate: 32693-4, mEq/L
4. Oxygen Saturation: 20564-1, g/dL
5. pH: 11558-4, units
6. Acid Phosphatase Non-Prostatic: 6298-4, mEq/L
7. Alanine Aminotransferase ALT: 1742-6, IU/L
8. Alkaline Phosphatase: 6768-6, IU/L
9. Anion Gap: 1863-0, mEq/L
10. Aspartate Aminotransferase AST: 1920-8, IU/L
11. Beta-2 Microglobulin: 32731-2, mEq/L
12. Bicarbonate: 1963-8, mEq/L
13. Calcium Total: 2000-8, mg/dL
14. Calculated Free Testosterone: 2991-8, mEq/L
15. Chloride: 2075-0, mEq/L
16. Cholesterol Ratio Total/HDL: 9322-9, Ratio
17. Cholesterol Total: 2093-3, mg/dL
18. Creatine Kinase MB: 6773-6, ng/mL
19. Creatinine: 2160-0, mg/dL
20. Glucose: 2345-7, mg/dL
21. Protein Total: 2885-2, g/dL
22. Bilirubin Total: 1975-2, mg/dL
23. Blood (urine): 5794-3, mEq/L
24. pO2: 11556-8, mm Hg
25. pCO2: 11557-6, mm Hg
26. CEA: 14647-2, mg/dL
27. Ammonia: 16362-6, umol/L
28. PSA: 17861-6, IU/L
29. Amylase: 1798-8, IU/L
30. FEV1: 20150-9, mg/dL
31. Cholesterol HDL: 2085-9, mg/dL
32. Cholesterol LDL Calculated: 2090-9, mg/dL
33. Creatine Kinase CK: 2157-6, IU/L
34. Lactate Dehydrogenase LD: 2532-0, IU/L
35. Magnesium: 2601-3, mg/dL
36. Oxygen partial pressure PaO2: 2708-6, mg/dL
37. Phosphate: 2777-1, mg/dL
38. Potassium: 2823-3, mEq/L
39. Sodium: 2951-2, mEq/L
40. Occult blood stool: 29771-3, mg/dL
41. Lipase: 3040-3, IU/L
42. Urea Nitrogen: 3094-0, mg/dL
43. Inhaled oxygen concentration: 3150-0, mg/dL
44. Estimated GFR MDRD: 33914-3
45. Kidney stone analysis: 34325-7, umol/L
46. Hemoglobin A1c: 4548-4, %
47. Oxygen saturation arterial SpO2: 59408-5, mg/dL
48. Troponin T: 6598-7, ng/mL
49. Leukocytes count: 6690-2, umol/L
50. Anisocytosis: 702-1
51. Gastrin: 74205-6, mg/dL
52. Body temperature: 8310-5, mEq/L
53. Diastolic Blood Pressure: 8462-4, mm[Hg]
54. Systolic Blood Pressure: 8480-6, mm[Hg]
55. Heart rate: 8867-4, mg/dL
56. BMI: 39156-5, kg/m2
`;

// ── System Prompt ────────────────────────────────────
function buildSystemPrompt() {
  return `## ROLE AND OBJECTIVE
You are CareBridge, an intelligent clinical information assistant that retrieves and analyzes patient records from FHIR R4 for healthcare staff. Search patients, retrieve clinical data, provide insights, identify patterns. Never provide treatment recommendations.

## PERSONALITY
Clinical, professional, efficient, analytical, evidence-based, patient with clarification.

## CONTEXT
- Access to FHIR R4 APIs: Patient, Condition, Procedure, Medication, Encounter, Observation
- Users: doctors, nurses, healthcare staff
- All data is confidential PHI

## COMMUNICATION GUIDELINES
- Keep responses concise and clinical
- One clarifying question at a time
- Use professional medical terminology
- Never provide medical advice
- Ask "Is there anything else I can assist you with?" only when:
  * Answer was brief/direct (single data point)
  * User seems to want more information
  * Multi-step analysis completed
- Do NOT ask after clarifications, multiple listings, or when you just asked a question
- End chat ONLY after user explicitly says "no", "nothing else", "that's all", "thank you" or similar negative/closing phrases
- If user says "ok", "alright", "got it", "thanks" without explicitly closing → Ask "Is there anything else I can assist you with?"
- Only trigger end_chat when user clearly indicates they're done, not just acknowledging the answer.
- When asked to provide clinical assessment, treatment plan, or clinical recommendations:
  * Do NOT say "I cannot provide this" or "My role is to..."
  * Instead redirect politely: "I can retrieve and summarize the patient's clinical data. Would you like me to compile a summary of today's visit findings (medications, labs, conditions, vitals)? The clinical assessment and plan would need to be completed by the attending physician."
- When answering from AI knowledge (not FHIR data): append "Note: This is AI-generated information. Re-confirmation with official sources is recommended."
- Do NOT add disclaimer when answering from webhook/FHIR responses.

## FORMATTING
- Dates: YYYY-MM-DD → ordinal format (15th February 1985)
- Lab values: "value unit" (7.2 g/dL)
- Use numbered lists for multiples
- Never show encounter numbers like Encounter/567834 to users
- Never pass Patient/PatientId in Subject — pass only the numeric ID

## FUNCTION REFERENCE
| Function | When to Call | Key Parameters |
|---|---|---|
| search_fhir_patient | Patient lookup by any identifier | EMAIL, GIVEN, FAMILY, PHONE, BIRTHDATE, PATIENT_ID |
| search_patient_condition | Diagnoses, conditions, history | SUBJECT, CODE, ENCOUNTER |
| search_patient_procedure | Procedures, surgeries | SUBJECT, CODE, ENCOUNTER |
| search_patient_medications | Medications, drugs, prescriptions | SUBJECT, PRESCRIPTIONID, CODE |
| search_patient_encounter | Admissions, discharges, insurance | SUBJECT, DATE (two date params for range) |
| search_patient_observations | Labs, vitals, test results | SUBJECT, CODE (LOINC), value_quantity, page |

## CRITICAL PARAMETER RULES
- NEVER pass null to any parameter — leave empty string instead
- NEVER pass "Patient/10017" in SUBJECT — pass only "10017"
- Never call same function twice for same data
- Store patient ID for follow-up queries in the same conversation

## RESPONSE PATTERNS
**search_fhir_patient:**
- 0 results: "No patients found matching [criteria]. Please verify the information."
- 1 result: Answer question, offer more details
- Multiple: List name, DOB, email, phone — ask which patient

**Conditions/Procedures/Medications:**
- Single: State name with code/status
- Multiple: Numbered list
- 10+: "This patient has [X] [items]. List all or looking for something specific?"
- For Conditions by name: Look up ICD-9 code from knowledge base → pass as CODE (no SUBJECT needed for cross-patient search)
- For Medications by drug name: Look up Drug Code from knowledge base → pass as CODE (no SUBJECT needed)
- If user asks for "active medications": fetch all medications for the patient, then filter and display ONLY those whose status is "active" — exclude stopped, cancelled, completed, or any other status
- For Procedures by category: Look up mincode/maxcode from knowledge base → pass as CODE

**Observations:**
- ALWAYS pass a CODE (LOINC) when calling search_patient_observations — never call without it as the API will error
- Always pass page=0 on first call; pass page=1, page=2 etc. for subsequent pages
- If >10 results ask user if they want more (then use page=1, page=2...)
- For specific observation: look up LOINC code → pass as CODE with SUBJECT
- For filtered queries (e.g. hemoglobin > 10): use value_quantity format: "gt10|mEq/L"
  * gt = greater than, lt = less than, eq = equal to
- After returning an observation value: look up parameter in observation ranges knowledge base → provide Result (Low/Normal/High) and Recommendations
- If user asks for "recent observations", "latest observations", "her observations", "his observations", or any general observation request WITHOUT specifying a type: DO NOT ask the user — automatically fetch these key observations in a SINGLE response with all 8 tool_calls at once (not one by one): Hemoglobin (718-7), Glucose (2345-7), Sodium (2951-2), Potassium (2823-3), Creatinine (2160-0), Systolic Blood Pressure (8480-6), Diastolic Blood Pressure (8462-4), Heart Rate (8867-4). Emit all 8 search_patient_observations calls simultaneously in one response, then present all results together as a clinical summary.

**search_patient_encounter:**
- For date range: pass first DATE as "gt2000-01-13", second DATE as "lt2024-09-13"
- For recent period (e.g., last 6 months): calculate start date, second DATE = "lt2026-02-22"
- No SUBJECT needed for cross-patient date searches

## CLINICAL ANALYSIS
For analytical questions (e.g., "Is patient diabetic?"):
1. Check relevant sources: Conditions, Medications, Lab values, Procedures
2. Synthesize findings with evidence
3. Answer directly with supporting data
Example: "Yes, based on: Diagnosis (Type 2 Diabetes ICD-10: E11.9), Medications (Metformin, Insulin), Lab values (Glucose 180, HbA1c 8.2%)"

## DISCHARGE SUMMARY
If requested, fetch: Patient demographics, Encounter (admission/discharge), Condition (diagnoses), Procedure, Observation (labs), MedicationRequest (discharge meds). Synthesize into brief narrative format.

${LOINC_CODES}

${CONDITION_CODES}

${DRUG_CODES}

${PROCEDURE_CODES}

${OBSERVATION_RANGES}

## CRITICAL REMINDERS
- Never fabricate data — only use data from API responses
- End chat only when user explicitly indicates they are done
- Acknowledgments like "ok", "alright", "got it" are NOT end signals
- Always provide evidence for clinical observations
- Distinguish between FHIR data (no disclaimer) and AI knowledge (add disclaimer)
`;
}

// ── OpenAI Tool Definitions ──────────────────────────
const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_fhir_patient",
      description: "Search for patients in the FHIR system by name, email, phone, birthdate, or patient ID.",
      parameters: {
        type: "object",
        properties: {
          GIVEN:      { type: "string", description: "Patient first/given name" },
          FAMILY:     { type: "string", description: "Patient last/family name" },
          EMAIL:      { type: "string", description: "Patient email address" },
          PHONE:      { type: "string", description: "Patient phone number" },
          BIRTHDATE:  { type: "string", description: "Patient date of birth (YYYY-MM-DD)" },
          PATIENT_ID: { type: "string", description: "Patient numeric ID" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_patient_condition",
      description: "Search patient conditions/diagnoses from FHIR. Can search by subject (patient ID) and/or ICD-9 code.",
      parameters: {
        type: "object",
        properties: {
          SUBJECT:   { type: "string", description: "Patient numeric ID (do NOT include 'Patient/' prefix)" },
          CODE:      { type: "string", description: "ICD-9 diagnosis code" },
          ENCOUNTER: { type: "string", description: "Encounter numeric ID" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_patient_procedure",
      description: "Search patient procedures/surgeries from FHIR. Can search by subject and/or CPT code or code range.",
      parameters: {
        type: "object",
        properties: {
          SUBJECT:   { type: "string", description: "Patient numeric ID" },
          CODE:      { type: "string", description: "CPT procedure code" },
          ENCOUNTER: { type: "string", description: "Encounter numeric ID" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_patient_medications",
      description: "Search patient medication requests/prescriptions from FHIR.",
      parameters: {
        type: "object",
        properties: {
          SUBJECT:        { type: "string", description: "Patient numeric ID" },
          CODE:           { type: "string", description: "Drug code (e.g. INSULIN, ACET325)" },
          PRESCRIPTIONID: { type: "string", description: "Prescription ID number" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_patient_encounter",
      description: "Search patient encounters (admissions, discharges, insurance info) from FHIR.",
      parameters: {
        type: "object",
        properties: {
          SUBJECT: { type: "string", description: "Patient numeric ID" },
          DATE:    { type: "string", description: "Start date filter e.g. 'gt2000-01-13' (gt=after, lt=before)" },
          DATE2:   { type: "string", description: "End date filter e.g. 'lt2024-09-13'" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_patient_observations",
      description: "Search patient lab results, vitals, and clinical observations from FHIR.",
      parameters: {
        type: "object",
        properties: {
          SUBJECT:        { type: "string", description: "Patient numeric ID" },
          CODE:           { type: "string", description: "LOINC observation code" },
          value_quantity: { type: "string", description: "Filter by value e.g. 'gt10|mEq/L' or 'lt5|mg/dL'" },
          page:           { type: "number", description: "Page number for pagination, starting at 0" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "end_chat",
      description: "End the conversation when the user explicitly indicates they are done (says 'no', 'nothing else', 'that's all', 'goodbye', 'bye', 'thank you' in a closing context).",
      parameters: {
        type: "object",
        properties: {
          farewell_message: { type: "string", description: "A short professional closing message to the user." }
        },
        required: ["farewell_message"]
      }
    }
  }
];

// ── FHIR API Callers ─────────────────────────────────
function getAuthHeader() {
  const token = localStorage.getItem("cb_token");
  if (!token) {
    window.location.reload();
    throw new Error("No auth token");
  }
  return { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };
}

async function callFhirApi(url) {
  const res = await fetch(url, { headers: getAuthHeader() });
  if (res.status === 401) {
    localStorage.removeItem("cb_token");
    localStorage.removeItem("cb_user");
    window.location.reload();
    throw new Error("Unauthorized");
  }
  return res.json();
}

function buildUrl(path, params) {
  const url = new URL(`${FHIR_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.append(k, v);
    }
  });
  return url.toString();
}

// Map function names to actual FHIR calls
async function executeTool(name, args) {
  try {
    switch (name) {
      case "search_fhir_patient": {
        const params = {};
        if (args.FAMILY)     params.family    = args.FAMILY;
        if (args.GIVEN)      params.given     = args.GIVEN;
        if (args.EMAIL)      params.email     = args.EMAIL;
        if (args.PHONE)      params.phone     = args.PHONE;
        if (args.BIRTHDATE)  params.birthdate = args.BIRTHDATE;
        if (args.PATIENT_ID) params._id       = args.PATIENT_ID;
        return await callFhirApi(buildUrl("/baseR4/Patient", params));
      }
      case "search_patient_condition": {
        const params = {};
        if (args.SUBJECT)   params.subject   = args.SUBJECT;
        if (args.CODE)      params.code      = args.CODE;
        if (args.ENCOUNTER) params.encounter = args.ENCOUNTER;
        return await callFhirApi(buildUrl("/baseR4/Condition", params));
      }
      case "search_patient_procedure": {
        const params = {};
        if (args.SUBJECT)   params.subject   = args.SUBJECT;
        if (args.CODE)      params.code      = args.CODE;
        if (args.ENCOUNTER) params.encounter = args.ENCOUNTER;
        return await callFhirApi(buildUrl("/baseR4/Procedure", params));
      }
      case "search_patient_medications": {
        const params = {};
        if (args.SUBJECT)        params.subject        = args.SUBJECT;
        if (args.CODE)           params.code           = args.CODE;
        if (args.PRESCRIPTIONID) params.prescriptionId = args.PRESCRIPTIONID;
        return await callFhirApi(buildUrl("/baseR4/MedicationRequest", params));
      }
      case "search_patient_encounter": {
        // date params need special handling (multiple values same key)
        const base = `${FHIR_BASE}/baseR4/Encounter`;
        const url  = new URL(base);
        if (args.SUBJECT) url.searchParams.append("subject", args.SUBJECT);
        if (args.DATE)    url.searchParams.append("date",    args.DATE);
        if (args.DATE2)   url.searchParams.append("date",    args.DATE2);
        return await callFhirApi(url.toString());
      }
      case "search_patient_observations": {
        const params = {};
        if (args.SUBJECT)        params.subject        = args.SUBJECT;
        if (args.CODE)           params.code           = args.CODE;
        if (args.value_quantity) params.value_quantity = args.value_quantity;
        // Always send page (server requires it to paginate/limit results)
        params.page = (args.page !== undefined && args.page !== null && args.page !== "") ? Number(args.page) : 0;
        return await callFhirApi(buildUrl("/baseR4/Observations", params));
      }
      case "end_chat":
        return { status: "conversation_ended" };
      default:
        return { error: `Unknown function: ${name}` };
    }
  } catch (err) {
    return { error: err.message };
  }
}

// ── OpenAI Streaming Chat Completion (with auto-retry on rate limit) ──
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Cached system prompt — built once per session
let _systemPromptCache = null;
function getSystemPrompt() {
  if (!_systemPromptCache) _systemPromptCache = buildSystemPrompt();
  return _systemPromptCache;
}

// Streams the OpenAI response. Calls onTextChunk(chunk) for each text delta.
// Returns { content, tool_calls, finish_reason }.
async function sendToOpenAI(messages, onTextChunk = null, retryCount = 0) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type":  "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      stream: true
    })
  });

  if (res.status === 429 && retryCount < 3) {
    const errText = await res.text();
    let waitMs = 12000;
    try {
      const errJson = JSON.parse(errText);
      const msg = errJson.error?.message || "";
      const match = msg.match(/try again in (\d+\.?\d*)s/i);
      if (match) waitMs = Math.ceil(parseFloat(match[1]) * 1000) + 500;
    } catch (e) {}
    const waitSec = Math.ceil(waitMs / 1000);
    const typingBubble = document.querySelector(".typing-bubble");
    if (typingBubble) {
      typingBubble.innerHTML = `<span style="font-size:11px;color:#4a5568">Rate limit reached. Retrying in ${waitSec}s...</span>`;
    }
    await sleep(waitMs);
    if (typingBubble) {
      typingBubble.innerHTML = `<span class="dot"></span><span class="dot"></span><span class="dot"></span>`;
    }
    return sendToOpenAI(messages, onTextChunk, retryCount + 1);
  }

  if (!res.ok) {
    const errJson = await res.json();
    throw new Error(errJson.error?.message || "OpenAI API error");
  }

  // Parse SSE stream
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let fullContent   = "";
  const toolCallsMap = {};
  let finishReason  = null;
  let buffer        = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete line

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") { finishReason = finishReason || "stop"; continue; }
      if (!data) continue;

      try {
        const parsed = JSON.parse(data);
        const choice = parsed.choices?.[0];
        if (!choice) continue;

        if (choice.finish_reason) finishReason = choice.finish_reason;

        const delta = choice.delta;
        if (delta?.content) {
          fullContent += delta.content;
          if (onTextChunk) onTextChunk(delta.content);
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!toolCallsMap[idx]) {
              toolCallsMap[idx] = { id: "", type: "function", function: { name: "", arguments: "" } };
            }
            if (tc.id)                 toolCallsMap[idx].id                   += tc.id;
            if (tc.function?.name)     toolCallsMap[idx].function.name        += tc.function.name;
            if (tc.function?.arguments) toolCallsMap[idx].function.arguments  += tc.function.arguments;
          }
        }
      } catch (e) { /* ignore malformed chunks */ }
    }
  }

  const toolCallsList = Object.values(toolCallsMap);
  return {
    content:       fullContent || null,
    tool_calls:    toolCallsList.length ? toolCallsList : null,
    finish_reason: finishReason || (toolCallsList.length ? "tool_calls" : "stop")
  };
}

// ── Streaming bubble helpers ─────────────────────────
function createStreamingBubble() {
  const container = document.getElementById("messages");
  const welcome = container.querySelector(".welcome-card");
  if (welcome) welcome.remove();

  const row = document.createElement("div");
  row.className = "msg-row bot";

  const img = document.createElement("img");
  img.src = "chatbot_image/chatbot.png";
  img.alt = "CareBridge";
  img.className = "msg-avatar";
  const avatarEl = document.createElement("div");
  avatarEl.appendChild(img);

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";

  const textEl = document.createElement("span");
  bubble.appendChild(textEl);

  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.maxWidth = "80%";
  wrapper.appendChild(bubble);

  const timeEl = document.createElement("span");
  timeEl.className = "msg-time";
  timeEl.textContent = formatTime();
  wrapper.appendChild(timeEl);

  row.appendChild(avatarEl);
  row.appendChild(wrapper);
  container.appendChild(row);
  scrollToBottom();
  return bubble;
}

function updateStreamingBubble(bubble, text) {
  bubble.querySelector("span").textContent = text;
  scrollToBottom();
}

function finalizeStreamingBubble(bubble, fullText) {
  bubble.innerHTML = simpleMarkdown(fullText || "");
  scrollToBottom();
}

// ── Agentic Loop: handles multiple tool calls with streaming ──
async function agentLoop(userMessage) {
  conversationHistory.push({ role: "user", content: userMessage });

  const messages = [
    { role: "system", content: getSystemPrompt() },
    ...conversationHistory
  ];

  showTyping();
  let streamBubble = null;

  try {
    while (true) {
      let chunkAccum = "";

      const result = await sendToOpenAI(messages, (chunk) => {
        // First chunk — hide typing indicator and create live bubble
        if (!streamBubble) {
          hideTyping();
          streamBubble = createStreamingBubble();
        }
        chunkAccum += chunk;
        updateStreamingBubble(streamBubble, chunkAccum);
      });

      const isToolCall = result.finish_reason === "tool_calls" ||
                         (result.tool_calls && result.tool_calls.length > 0);

      if (isToolCall) {
        streamBubble = null; // reset for next iteration

        const assistantMsg = {
          role:       "assistant",
          content:    result.content || null,
          tool_calls: result.tool_calls
        };
        messages.push(assistantMsg);
        conversationHistory.push(assistantMsg);

        // Handle end_chat
        const endCall = result.tool_calls.find(tc => tc.function.name === "end_chat");
        if (endCall) {
          const args = JSON.parse(endCall.function.arguments || "{}");
          hideTyping();
          appendMessage("bot", args.farewell_message || "Thank you for using CareBridge. Have a great day!");
          return;
        }

        // Execute all tool calls in parallel
        const toolResults = await Promise.all(
          result.tool_calls.map(async (tc) => {
            const args = JSON.parse(tc.function.arguments || "{}");
            const res  = await executeTool(tc.function.name, args);
            return {
              role:         "tool",
              tool_call_id: tc.id,
              content:      JSON.stringify(res)
            };
          })
        );

        messages.push(...toolResults);
        conversationHistory.push(...toolResults);
        showTyping(); // show typing again while AI processes tool results

      } else {
        // Final text response
        const finalText = result.content || "";
        conversationHistory.push({ role: "assistant", content: finalText });

        if (streamBubble) {
          finalizeStreamingBubble(streamBubble, finalText);
        } else {
          hideTyping();
          appendMessage("bot", finalText);
        }
        break;
      }
    }
  } catch (err) {
    hideTyping();
    appendMessage("bot", `Sorry, I encountered an error: ${err.message}. Please try again.`);
    console.error("Agent error:", err);
  }
}

// ── Login ────────────────────────────────────────────
async function doLogin(email, password) {
  const res = await fetch(LOGIN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ email, password })
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 400) throw new Error("Invalid credentials. Please try again.");
    throw new Error(`Login failed (${res.status}). Please try again.`);
  }

  const data = await res.json();

  const token = data.idToken || data.token || data.access_token;
  if (!token) throw new Error("Login failed: no token received.");

  const name = data.displayName || data.name || email.split("@")[0];

  localStorage.setItem("cb_token", token);
  localStorage.setItem("cb_user",  name);
  return name;
}

// ── DOM Helpers ──────────────────────────────────────
function showTyping() {
  document.getElementById("typing-indicator").classList.remove("hidden");
  scrollToBottom();
}
function hideTyping() {
  document.getElementById("typing-indicator").classList.add("hidden");
}

function formatTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Markdown renderer using marked.js (handles numbered lists, bullets, bold, code, etc.)
function simpleMarkdown(text) {
  return marked.parse(text || "");
}

function appendMessage(role, text) {
  const container = document.getElementById("messages");

  // Remove welcome card if present
  const welcome = container.querySelector(".welcome-card");
  if (welcome) welcome.remove();

  const row = document.createElement("div");
  row.className = `msg-row ${role}`;

  const isBot = role === "bot";

  const avatarEl = document.createElement("div");
  if (isBot) {
    const img = document.createElement("img");
    img.src = "chatbot_image/chatbot.png";
    img.alt = "CareBridge";
    img.className = "msg-avatar";
    avatarEl.appendChild(img);
  } else {
    avatarEl.className = "msg-avatar user-av";
    avatarEl.textContent = userInitial;
  }

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  if (isBot) {
    bubble.innerHTML = simpleMarkdown(text);
  } else {
    bubble.textContent = text;
  }

  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.maxWidth = "80%";

  wrapper.appendChild(bubble);

  const timeEl = document.createElement("span");
  timeEl.className = "msg-time";
  timeEl.textContent = formatTime();
  wrapper.appendChild(timeEl);

  if (isBot) {
    row.appendChild(avatarEl);
    row.appendChild(wrapper);
  } else {
    row.appendChild(wrapper);
    row.appendChild(avatarEl);
  }

  container.appendChild(row);
  scrollToBottom();
}

function scrollToBottom() {
  const el = document.getElementById("messages");
  el.scrollTop = el.scrollHeight;
}

function showWelcomeCard(name) {
  const container = document.getElementById("messages");
  container.innerHTML = `
    <div class="welcome-card">
      <img src="chatbot_image/chatbot.png" alt="CareBridge" />
      <h3>Hey ${name}, how can I assist you today?</h3>
      <p>Search patient records, retrieve lab results, conditions, medications, encounters, and procedures.</p>
      <div class="welcome-chips">
        <span class="chip" data-q="Search for patient David Stan">Search patient</span>
        <span class="chip" data-q="Show conditions for patient 10035">View conditions</span>
        <span class="chip" data-q="What is the hemoglobin count for patient 10035?">Lab results</span>
        <span class="chip" data-q="List medications for patient 10035">Medications</span>
        <span class="chip" data-q="Show encounters for patient 10035">Encounters</span>
      </div>
    </div>
  `;
  // Chip click handlers
  container.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const q = chip.getAttribute("data-q");
      document.getElementById("user-input").value = q;
      handleSend();
    });
  });
}

// ── Display Name Formatter ───────────────────────────
function formatDisplayName(raw) {
  // Strip email domain if full email (e.g. abc.pqr@gmail.com → abc.pqr)
  let name = raw.includes("@") ? raw.split("@")[0] : raw;
  // Take only the first part before a dot (e.g. rishabh.raj → rishabh)
  name = name.split(".")[0];
  // Capitalize first letter
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

// ── Screen Transitions ───────────────────────────────
function showChatScreen(name) {
  const displayName = formatDisplayName(name);
  userName    = displayName;
  userInitial = displayName.charAt(0).toUpperCase();

  // Hide login, show home page and chat widget
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("home-screen").classList.remove("hidden");
  document.getElementById("chat-widget").classList.remove("hidden");

  showWelcomeCard(displayName);
}

function handleLogout() {
  localStorage.removeItem("cb_token");
  localStorage.removeItem("cb_user");
  // Note: we intentionally keep cb_oai_key so user doesn't have to re-enter it
  conversationHistory = [];

  // Close chat panel if open
  document.getElementById("chat-panel").classList.add("hidden");
  document.getElementById("chat-toggle-btn").querySelector(".toggle-icon-open").classList.remove("hidden");
  document.getElementById("chat-toggle-btn").querySelector(".toggle-icon-close").classList.add("hidden");

  // Hide home + widget, show login
  document.getElementById("home-screen").classList.add("hidden");
  document.getElementById("chat-widget").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("login-form").reset();
  document.getElementById("login-error").classList.add("hidden");
}

// ── Send Message ─────────────────────────────────────
async function handleSend() {
  const input   = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-btn");
  const text    = input.value.trim();
  if (!text) return;

  input.value = "";
  input.style.height = "auto";
  sendBtn.disabled = true;

  appendMessage("user", text);
  await agentLoop(text);

  sendBtn.disabled = false;
  input.focus();
}

// ── API Key Modal ─────────────────────────────────────
function showApiKeyModal(onSuccess) {
  const modal   = document.getElementById("apikey-modal");
  const input   = document.getElementById("apikey-input");
  const saveBtn = document.getElementById("apikey-save-btn");
  const errEl   = document.getElementById("apikey-error");

  modal.classList.remove("hidden");
  input.focus();

  document.getElementById("toggle-apikey").addEventListener("click", () => {
    input.type = input.type === "password" ? "text" : "password";
  });

  saveBtn.addEventListener("click", () => {
    const key = input.value.trim();
    if (!key.startsWith("sk-")) {
      errEl.classList.remove("hidden");
      return;
    }
    errEl.classList.add("hidden");
    localStorage.setItem("cb_oai_key", key);
    OPENAI_API_KEY = key;
    modal.classList.add("hidden");
    onSuccess();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveBtn.click();
  });
}

// ── Event Listeners ──────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {

  // Auto-login check
  const savedToken = localStorage.getItem("cb_token");
  const savedUser  = localStorage.getItem("cb_user");
  if (savedToken && savedUser) {
    if (!OPENAI_API_KEY) {
      showApiKeyModal(() => showChatScreen(savedUser));
    } else {
      showChatScreen(savedUser);
    }
  }

  // Login form
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email    = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const btn      = document.getElementById("login-btn");
    const btnText  = document.getElementById("btn-text");
    const spinner  = document.getElementById("btn-spinner");
    const errBanner= document.getElementById("login-error");
    const errText  = document.getElementById("login-error-text");
    const overlay  = document.getElementById("signin-overlay");

    errBanner.classList.add("hidden");
    btn.disabled = true;
    btnText.textContent = "Signing in...";
    spinner.classList.remove("hidden");
    overlay.classList.remove("hidden");

    try {
      const name = await doLogin(email, password);
      if (!OPENAI_API_KEY) {
        overlay.classList.add("hidden");
        showApiKeyModal(() => showChatScreen(name));
      } else {
        overlay.classList.add("hidden");
        showChatScreen(name);
      }
    } catch (err) {
      overlay.classList.add("hidden");
      errText.textContent = err.message;
      errBanner.classList.remove("hidden");
    } finally {
      btn.disabled = false;
      btnText.textContent = "Launch Provider Assistant";
      spinner.classList.add("hidden");
    }
  });

  // Toggle password visibility
  document.getElementById("toggle-password").addEventListener("click", () => {
    const pwInput = document.getElementById("password");
    pwInput.type  = pwInput.type === "password" ? "text" : "password";
  });

  // Logout button (navbar)
  document.getElementById("logout-btn").addEventListener("click", handleLogout);

  // Chat widget toggle
  document.getElementById("chat-toggle-btn").addEventListener("click", () => {
    const panel     = document.getElementById("chat-panel");
    const iconOpen  = document.querySelector(".toggle-icon-open");
    const iconClose = document.querySelector(".toggle-icon-close");
    const isOpen    = !panel.classList.contains("hidden");

    if (isOpen) {
      panel.classList.add("hidden");
      iconOpen.classList.remove("hidden");
      iconClose.classList.add("hidden");
    } else {
      panel.classList.remove("hidden");
      iconOpen.classList.add("hidden");
      iconClose.classList.remove("hidden");
      scrollToBottom();
    }
  });

  // Close chat panel button
  document.getElementById("close-chat-btn").addEventListener("click", () => {
    document.getElementById("chat-panel").classList.add("hidden");
    document.querySelector(".toggle-icon-open").classList.remove("hidden");
    document.querySelector(".toggle-icon-close").classList.add("hidden");
  });

  // Send button
  document.getElementById("send-btn").addEventListener("click", handleSend);

  // Enter key to send (Shift+Enter = newline)
  const userInput = document.getElementById("user-input");
  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Auto-resize textarea
  userInput.addEventListener("input", () => {
    const sendBtn = document.getElementById("send-btn");
    sendBtn.disabled = userInput.value.trim() === "";
    userInput.style.height = "auto";
    userInput.style.height = Math.min(userInput.scrollHeight, 100) + "px";
  });

  // Clear chat
  document.getElementById("clear-chat-btn").addEventListener("click", () => {
    conversationHistory = [];
    showWelcomeCard(userName);
  });

});
