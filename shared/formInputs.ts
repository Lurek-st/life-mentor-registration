import { normalizeEmployee } from "./model";
import { normaliseEmail, validEmail } from "./email";
import { identityRules } from "./config";

export const SCHOOL_DOMAIN = identityRules.emailDomain;
export const SCHOOL_SUFFIX = SCHOOL_DOMAIN ? "@" + SCHOOL_DOMAIN : "";
export const EMPLOYEE_ERROR = identityRules.employeeDigits
  ? `工号须为${identityRules.employeeDigits}位数字，请核对后再提交。`
  : "工号请使用字母、数字、点、下划线或短横线，以字母或数字开头，最多80位。";
export const SCHOOL_EMAIL_ERROR = SCHOOL_DOMAIN
  ? `请使用 @${SCHOOL_DOMAIN} 邮箱，并核对 @ 前的内容。`
  : "请填写一个有效的联系邮箱。";

export const validEmployeeNumber = (value: string) => {
  const id = normalizeEmployee(value);
  return identityRules.employeeDigits
    ? new RegExp(`^[0-9]{${identityRules.employeeDigits}}$`).test(id)
    : /^[A-Z0-9][A-Z0-9._-]{0,79}$/.test(id);
};
export const validSchoolEmail = (value: string) =>
  validEmail(value) &&
  (!SCHOOL_DOMAIN || value.split("@")[1].toLowerCase() === SCHOOL_DOMAIN);

// Store a complete address. An unrecognized pasted domain stays visible and invalid.
export function schoolEmailFromInput(input: string): string {
  const text = normaliseEmail(input);
  return !SCHOOL_DOMAIN || !text || text.includes("@")
    ? text
    : text + SCHOOL_SUFFIX;
}
export function schoolEmailInput(value: string): string {
  const text = normaliseEmail(value);
  return SCHOOL_DOMAIN &&
    text.split("@").length === 2 &&
    text.endsWith(SCHOOL_SUFFIX)
    ? text.slice(0, -SCHOOL_SUFFIX.length)
    : value;
}
