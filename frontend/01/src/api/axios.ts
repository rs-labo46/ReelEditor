import axios from "axios";

const axiosApi = axios.create({
  baseURL: "/api",
  withCredentials: true,
  timeout: 32_000,
  adapter: "fetch",
  fetchOptions: {
    cache: "no-store",
    credentials: "same-origin",
    redirect: "error",
  },
  responseType: "text",
  validateStatus: () => true,
});

export default axiosApi;
