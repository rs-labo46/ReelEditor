import type { FormEvent } from "react";
import type { LoginInput, SignupInput } from "../types/auth";

type Props = {
  signup: boolean;
  blocked: boolean;
  minPassword: number;
  onSignup: (value: SignupInput) => Promise<boolean>;
  onLogin: (value: LoginInput) => Promise<boolean>;
  onSuccess: () => void;
};

export default function Auth({
  signup,
  blocked,
  minPassword,
  onSignup,
  onLogin,
  onSuccess,
}: Props) {
  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
  }
}
