import { identityRules } from "../shared/config";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { normalizeEmployee } from "../shared/model";
import { validEmail } from "../shared/email";
import {
  EMPLOYEE_ERROR,
  SCHOOL_EMAIL_ERROR,
  SCHOOL_SUFFIX,
  validEmployeeNumber,
  validSchoolEmail,
  schoolEmailFromInput,
  schoolEmailInput,
} from "../shared/formInputs";
import { useLanguage } from "./language";

type Props = {
  value: string;
  onChange: (value: string) => void;
  formal: boolean;
  disabled?: boolean;
  required?: boolean;
};

function useField(error: string) {
  const id = useId(),
    ref = useRef<HTMLInputElement>(null);
  const [touched, setTouched] = useState(false);
  useLayoutEffect(() => {
    ref.current?.setCustomValidity(error);
  }, [error]);
  return { id, ref, touched, setTouched };
}

export function EmployeeField({ value, onChange, formal, disabled }: Props) {
  const { tr, language } = useLanguage();
  const digits = formal ? identityRules.employeeDigits : null;
  const error =
    formal && !validEmployeeNumber(value)
      ? language === "en"
        ? digits
          ? `Enter exactly ${digits} digits.`
          : "Use 1–80 letters, digits, dots, underscores or hyphens, starting with a letter or digit."
        : EMPLOYEE_ERROR
      : "";
  const { id, ref, touched, setTouched } = useField(error);
  return (
    <div className="identity-field">
      <label htmlFor={id}>
        {digits
          ? language === "en"
            ? `Employee number (${digits} digits)`
            : `工号（${digits}位数字）`
          : tr("工号 Employee number")}
      </label>
      <input
        id={id}
        ref={ref}
        required
        maxLength={80}
        value={value}
        inputMode={digits ? "numeric" : "text"}
        autoComplete="off"
        disabled={disabled}
        aria-describedby={
          id + "-hint" + (touched && error ? " " + id + "-error" : "")
        }
        aria-invalid={touched && !!error}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          const normalized = formal
            ? value.normalize("NFKC").trim()
            : normalizeEmployee(value);
          if (normalized !== value) onChange(normalized);
        }}
        onInvalid={() => setTouched(true)}
      />
      <span className="field-hint" id={id + "-hint"}>
        {formal
          ? digits
            ? language === "en"
              ? `Enter your full ${digits}-digit employee number`
              : `请填写完整的${digits}位工号`
            : language === "en"
              ? "Enter your complete employee number, including leading zeros."
              : "请填写完整工号，保留开头的零。"
          : tr("测试环境请使用 TEST- 开头的虚构工号。")}
      </span>
      {touched && error && (
        <span className="field-error" id={id + "-error"}>
          {error}
        </span>
      )}
    </div>
  );
}

export function EmailField({
  value,
  onChange,
  formal,
  disabled,
  required = true,
}: Props) {
  const { tr, language } = useLanguage();
  const fixedDomain = formal && !!identityRules.emailDomain;
  const empty = !value.trim();
  const error =
    empty && !required
      ? ""
      : (formal ? validSchoolEmail(value) : validEmail(value))
        ? ""
        : fixedDomain && language === "en"
          ? `Use an @${identityRules.emailDomain} address and check the part before @.`
          : tr(fixedDomain ? SCHOOL_EMAIL_ERROR : "请填写一个有效的联系邮箱。");
  const { id, ref, touched, setTouched } = useField(error);
  return (
    <div className="identity-field">
      <label htmlFor={id}>
        {tr(
          fixedDomain
            ? required
              ? "联系邮箱"
              : "联系邮箱（可稍后补充）"
            : "联系邮箱 Email",
        )}
      </label>
      <span className={fixedDomain ? "school-email-control" : "email-control"}>
        <input
          id={id}
          ref={ref}
          required={required}
          type={fixedDomain ? "text" : "email"}
          maxLength={254}
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          disabled={disabled}
          value={fixedDomain ? schoolEmailInput(value) : value}
          aria-describedby={
            id + "-hint" + (touched && error ? " " + id + "-error" : "")
          }
          aria-invalid={touched && !!error}
          onChange={(e) =>
            onChange(
              fixedDomain
                ? schoolEmailFromInput(e.target.value)
                : e.target.value,
            )
          }
          onInvalid={() => setTouched(true)}
        />
        {fixedDomain && (
          <span className="school-email-suffix" aria-hidden="true">
            {SCHOOL_SUFFIX}
          </span>
        )}
      </span>
      <span className="field-hint" id={id + "-hint"}>
        {tr(
          fixedDomain
            ? "填写 @ 前的部分，后缀已自动补全。"
            : formal
              ? "请填写一个有效的联系邮箱。"
              : "请填写测试邮箱。",
        )}
        {fixedDomain && <span className="sr-only"> {SCHOOL_SUFFIX}</span>}
      </span>
      {touched && error && (
        <span className="field-error" id={id + "-error"}>
          {error}
        </span>
      )}
    </div>
  );
}
