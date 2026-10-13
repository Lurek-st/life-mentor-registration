/** Public defaults. Change here and rebuild both the website and worker together. */
export const identityRules: {
  employeeDigits: number | null;
  emailDomain: string;
} = {
  // null accepts the v2 alphanumeric employee IDs; e.g. 8 requires eight digits.
  employeeDigits: null,
  // Empty means a complete contact address. Example fixed domain: example.org.
  emailDomain: "",
};

if (
  identityRules.employeeDigits !== null &&
  (!Number.isInteger(identityRules.employeeDigits) ||
    identityRules.employeeDigits < 1 ||
    identityRules.employeeDigits > 80)
)
  throw new Error("employeeDigits must be null or an integer from 1 to 80");

identityRules.emailDomain = identityRules.emailDomain.trim().toLowerCase();
if (
  identityRules.emailDomain &&
  !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(
    identityRules.emailDomain,
  )
)
  throw new Error("emailDomain must be empty or a domain without @");
