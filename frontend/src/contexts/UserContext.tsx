import { createContext, useState } from "react";
import { API } from "../config/constants";

export type User = {
  id: string;
  name: string;
  branch: string;
  position: string;
  email: string;
  image: string;
  role: UserRole;
  login: string;
};

export type UserRole = 'DEVELOPER' | 'ADMIN' | 'SUPERVISOR' | 'EMPLOYEE';

type Props = {
  children?: React.ReactNode;
};

type UserContextTypes = {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
  refreshAccessToken: () => void;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
};

export const UserContext = createContext<UserContextTypes | undefined>(undefined);

export const UserContextProvider = ({ children }: Props) => {
  const [user, setUser] = useState<User | null>(() => {
    const value = localStorage.getItem('user');
    return value ? JSON.parse(value) : null;
  });

  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));

  const login = (user: User, token: string) => {
    setUser(user);
    setToken(token);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  };

  const refreshAccessToken = async () => {
    const response = await fetch(`${API}/refresh-token`, {
      method: 'POST',
      credentials: 'include'
    });

    if (response.ok) {
      const json = await response.json();
      setToken(json.token);
      localStorage.setItem('token', json.token);
    }
  };

  return (
    <UserContext.Provider value={{ user, token, login, logout, refreshAccessToken, setUser }}>
      {children}
    </UserContext.Provider>
  );
};
