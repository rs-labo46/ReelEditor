export type User = {
  id: number;
  name: string;
  email: string;
};

export type AuthView = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  user: User;
};

export type SignupInput = {
  name: string;
  email: string;
  password: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type Config = {
  stage: 1;
  min_password: number;
};
