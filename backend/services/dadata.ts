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
  return {
    inn: first.inn || '',
    kpp: first.kpp || '',
    ogrn: first.ogrn || '',
    name: first.name?.full_with_opf || first.name?.full || '',
    shortName: first.name?.short_with_opf || first.name?.short || '',
    address: first.address?.value || '',
    phone: '',
    email: '',
    taxationSystem: first.opf?.short || '',
  };
}


