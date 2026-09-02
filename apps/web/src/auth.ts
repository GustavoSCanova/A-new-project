export const saveToken = (token: string) => {
  localStorage.setItem('finance_token', token);
};

export const getToken = () => localStorage.getItem('finance_token');

export const clearToken = () => {
  localStorage.removeItem('finance_token');
};
