import axios from 'axios';

const BASE_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs';

function getToken(): string {
  const token = process.env.DADATA_TOKEN;
  if (!token) throw new Error('DADATA_TOKEN not configured');
  return token;
}

export interface DadataParty {
  inn: string;
  kpp?: string;
  ogrn?: string;
  name: string;
  shortName?: string;
  address?: string;
  phone?: string;
  email?: string;
  taxationSystem?: string;
  siEgrul?: string; // state.status
  statusCode?: number; // state.code
  deStatusCode?: string; // human readable
  liquidationDate?: string;
  successorName?: string;
  successorINN?: string;
  // Расширенные поля
  phones?: string[];
  emails?: string[];
  managerName?: string;
  managerPost?: string;
  capital?: number;
  revenue?: number;
  expenses?: number;
  licenses?: string[];
  courtDecisions?: string[];
  taxViolations?: string[];
  isReliable?: boolean;
  founders?: Array<{
    name: string;
    inn: string;
    share: number;
  }>;
}

export async function suggestParty(query: string): Promise<DadataParty[]> {
  if (!query?.trim()) return [];
  const token = getToken();
  const url = `${BASE_URL}/suggest/party`;
  const resp = await axios.post(url, { query }, {
    headers: { 'Content-Type': 'application/json', Authorization: `Token ${token}` }
  }).catch(() => ({ data: { suggestions: [] } } as any));
  const suggestions = resp?.data?.suggestions || [];
  const decodeStatus = (code?: number | string): string => {
    const map: Record<string, string> = {
      '113': 'Возбуждено производство по делу о банкротстве',
      '114': 'Наблюдение (банкротство)',
      '115': 'Финансовое оздоровление',
      '116': 'Внешнее управление',
      '117': 'Открыто конкурсное производство',
      '201': 'Ликвидация',
      '301': 'Реорганизация (преобразование)'
    };
    const k = typeof code === 'number' ? String(code) : (code || '');
    return map[k] || '';
  };
  return suggestions.map((s: any) => ({
    inn: s?.data?.inn || '',
    kpp: s?.data?.kpp || '',
    ogrn: s?.data?.ogrn || '',
    name: s?.value || s?.data?.name?.full_with_opf || '',
    shortName: s?.data?.name?.short_with_opf || s?.data?.name?.short || '',
    address: s?.data?.address?.value || '',
    phone: s?.data?.phones?.[0]?.data?.source || '',
    email: s?.data?.emails?.[0]?.data?.source || '',
    taxationSystem: s?.data?.finance?.tax_system || '',
    siEgrul: s?.data?.state?.status || '',
    statusCode: typeof s?.data?.state?.code === 'number' ? s?.data?.state?.code : (s?.data?.state?.code ? Number(s?.data?.state?.code) : undefined),
    deStatusCode: decodeStatus(s?.data?.state?.code),
    liquidationDate: s?.data?.state?.liquidation_date ? new Date(s?.data?.state?.liquidation_date).toISOString() : undefined,
    successorName: s?.data?.successors?.[0]?.name || '',
    successorINN: s?.data?.successors?.[0]?.inn || '',
  }));
}

export async function findPartyByInn(inn: string): Promise<DadataParty | null> {
  if (!inn?.trim()) return null;
  const token = getToken();
  const url = `${BASE_URL}/findById/party`;
  const resp = await axios.post(url, { query: inn }, {
    headers: { 'Content-Type': 'application/json', Authorization: `Token ${token}` }
  }).catch(() => ({ data: { suggestions: [] } } as any));
  const first = resp?.data?.suggestions?.[0]?.data;
  if (!first) return null;
  
  // Извлекаем телефоны
  const phones = first.phones?.map((p: any) => p.data?.source).filter(Boolean) || [];
  
  // Извлекаем email адреса
  const emails = first.emails?.map((e: any) => e.data?.source).filter(Boolean) || [];
  
  // Информация о руководителе
  const manager = first.management;
  
  // Финансовая информация
  const finance = first.finance;
  
  // Учредители
  const founders = first.founders?.map((f: any) => ({
    name: f.name || '',
    inn: f.inn || '',
    share: f.share || 0
  })) || [];
  
  // Лицензии
  const licenses = first.licenses?.map((l: any) => l.name).filter(Boolean) || [];
  
  // Судебные решения
  const courtDecisions = first.courtDecisions?.map((c: any) => 
    `${c.name} от ${c.date ? new Date(c.date).toLocaleDateString() : ''}`
  ).filter(Boolean) || [];
  
  // Налоговые нарушения
  const taxViolations = first.taxViolations?.map((t: any) => 
    `${t.name} от ${t.date ? new Date(t.date).toLocaleDateString() : ''}`
  ).filter(Boolean) || [];
  
  return {
    inn: first.inn || '',
    kpp: first.kpp || '',
    ogrn: first.ogrn || '',
    name: first.name?.full_with_opf || first.name?.full || '',
    shortName: first.name?.short_with_opf || first.name?.short || '',
    address: first.address?.value || '',
    phone: phones[0] || '',
    email: emails[0] || '',
    taxationSystem: first.opf?.short || '',
    // Расширенные поля
    phones,
    emails,
    managerName: manager?.name || '',
    managerPost: manager?.post || '',
    capital: finance?.capital?.value || 0,
    revenue: finance?.revenue || 0,
    expenses: finance?.expenses || 0,
    licenses,
    courtDecisions,
    taxViolations,
    isReliable: !first.invalid,
    founders,
    siEgrul: first.state?.status || '',
    statusCode: first.state?.code,
    liquidationDate: first.state?.liquidation_date ? new Date(first.state.liquidation_date).toISOString() : undefined,
  };
}


