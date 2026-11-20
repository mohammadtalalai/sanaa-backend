import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  OptionHTMLAttributes,
  SelectHTMLAttributes,
} from 'react';

export function Button({
  children,
  variant = '',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) {
  return (
    <button {...props} className={`button ${variant} ${className}`}>
      {children}
    </button>
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${className}`} />;
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className="input">
      {children}
    </select>
  );
}

export function Option(props: OptionHTMLAttributes<HTMLOptionElement>) {
  return <option {...props}>{props.children}</option>;
}

export function Heading({
  children,
  level = 2,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { level?: number }) {
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3';
  return <Tag {...props}>{children}</Tag>;
}
