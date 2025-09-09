import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Grid, Group, LoadingOverlay, Text, Title, Drawer, ActionIcon, Tooltip, Tabs, Accordion, Stack, Button, Paper, Badge } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import dayjs from 'dayjs';
import { API } from '../../../config/constants';
// Switch Dadata calls to backend endpoints
import { FilterGroup } from '../../../utils/filter';
import { DynamicFormModal, type FormConfig } from '../../../utils/formModal';
import { FilePreviewModal } from '../../../utils/FilePreviewModal';
import { useUserContext } from '../../../hooks/useUserContext';
import { TableComponent } from '../../../utils/table';
import { IconPlus, IconPencil, IconTrash, IconDownload } from '@tabler/icons-react';
import { DndProviderWrapper } from '../../../utils/dnd';

interface TypeOption { value: string; label: string; colorHex?: string | null }

interface DocDirectory {
  id: string;
  fullName: string;
  name: string;
  address: string;
  inn: number;
  ogrn: string;
  kpp: string;
  taxationSystem: string;
  phone: string;
  email: string;
  siEgrul: string;
  statusCode: number;
  deStatusCode: string;
  liquidationDate: string;
  successorName: string;
  successorINN: string;
}

interface RocData {
  id: string;
  createdAt: string;
  updatedAt?: string;
  name: string;
  typeTerm?: string;
  contractNumber?: string;
  dateContract?: string;
  agreedTo?: string;
  shelfLife?: number;
  typeContract?: { id: string; name: string; colorHex?: string | null } | null;
  statusContract?: { id: string; name: string; colorHex?: string | null } | null;
  doc?: DocDirectory | null;
}

const DEFAULT_FORM: any = {
  userAddId: '',
  userUpdatedId: '',
  name: '',
  contractNumber: '',
  typeContractId: '',
  statusContractId: '',
  dateContract: dayjs().format('YYYY-MM-DD'),
  agreedTo: '',
  shelfLife: 0,
  terminationLetter: false,
  terminationСonditions: '',
  peculiarities: '',
  folderNo: '',
  roc: { selectedByName: '' as string, selectedByInn: '' as string },
  doc: {
    fullName: '', name: '', address: '', inn: '', ogrn: '', kpp: '', taxationSystem: '', phone: '', email: '', siEgrul: '', statusCode: '', deStatusCode: '', liquidationDate: '', successorName: '', successorINN: ''
  },
  attachments: [],
  additionalAttachments: [],
};

export default function RocList() {
  const { user } = useUserContext();
  const [data, setData] = useState<RocData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RocData | null>(null);
  const [formValues, setFormValues] = useState(DEFAULT_FORM);
  const [types, setTypes] = useState<TypeOption[]>([]);
  const [statuses, setStatuses] = useState<TypeOption[]>([]);
  const [filters, setFilters] = useState({ column: [] as any[], sorting: [{ id: 'createdAt', desc: true }] });
  const [activeTab, setActiveTab] = useState<'list' | 'byDoc'>('list');

  // local modal handled via Mantine Modal below

  const fetchJson = useCallback(async <T,>(url: string, options?: RequestInit): Promise<T | null> => {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
        ...(options?.method && options.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
      },
      ...options,
    });
    if (!resp.ok) throw new Error(await resp.text());
    if (resp.status === 204) return null;
    const text = await resp.text();
    return text ? (JSON.parse(text) as T) : null;
  }, []);

  const loadRefs = useCallback(async () => {
    const [t, s] = await Promise.all([
      fetchJson<TypeOption[]>(`${API}/accounting/roc/dict/types`),
      fetchJson<TypeOption[]>(`${API}/accounting/roc/dict/statuses`),
    ]);
    setTypes((t || []).map((o: any) => ({ value: o.id, label: o.name, colorHex: o.colorHex })));
    setStatuses((s || []).map((o: any) => ({ value: o.id, label: o.name, colorHex: o.colorHex })));
  }, [fetchJson]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchJson<RocData[]>(`${API}/accounting/roc`);
      setData(list || []);
    } finally {
      setLoading(false);
    }
  }, [fetchJson]);

  useEffect(() => {
    loadRefs();
    loadList();
  }, [loadRefs, loadList]);

  const filtersConfig = useMemo(() => ([
    { columnId: 'name', label: 'Контрагент', type: 'text' as const },
    { columnId: 'typeContractId', label: 'Тип договора', type: 'select' as const, options: types },
    { columnId: 'statusContractId', label: 'Статус', type: 'select' as const, options: statuses },
    { columnId: 'dateContract', label: 'Дата договора', type: 'date' as const },
  ]), [types, statuses]);

  const [formConfig, setFormConfig] = useState<FormConfig>({ initialValues: DEFAULT_FORM, fields: [] });
  // const [attachments, setAttachments] = useState<File[]>([]);

  // Single-modal UX with Dadata: two MultiSelects (Контрагент, ИНН) → preview pane
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null);
  const [nameOptions, setNameOptions] = useState<{ value: string; label: string }[]>([]);
  const [innOptions, setInnOptions] = useState<{ value: string; label: string }[]>([]);
  const [idToParty, setIdToParty] = useState<Record<string, any>>({});
  const [activePartyId, setActivePartyId] = useState<string | null>(null);

  const enrichByInn = useCallback(async (id: string) => {
    const p = idToParty[id];
    const inn = p?.inn || (typeof id === 'string' ? id.split('|')[0] : undefined);
    if (!inn) return p;
    try {
      const full = await fetchJson<any>(`${API}/accounting/roc/dadata/party?inn=${encodeURIComponent(inn)}`);
      if (full) {
        setIdToParty(prev => ({ ...prev, [id]: { ...p, ...full } }));
        return { ...p, ...full };
      }
    } catch {}
    return p;
  }, [API, fetchJson, idToParty]);
  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q || q.length < 3) { return; }
    try {
      const items = (await fetchJson<any[]>(`${API}/accounting/roc/dadata/suggest?query=${encodeURIComponent(q)}`)) || [];
      const mkId = (s: any, idx: number) => `${s.inn}|${s.kpp || ''}|${idx}`;
      setNameOptions(items.map((s: any, idx: number) => ({ value: mkId(s, idx), label: `${s.name} (ИНН ${s.inn}${s.kpp ? ` / КПП ${s.kpp}` : ''})` })));
      setInnOptions(items.map((s: any, idx: number) => ({ value: mkId(s, idx), label: `${s.inn}${s.kpp ? ` / ${s.kpp}` : ''} — ${s.name}` })));
      // Store FULL payload for backend/doc enrichment
      setIdToParty(prev => {
        const next = { ...prev } as Record<string, any>;
        items.forEach((s: any, idx: number) => { next[mkId(s, idx)] = s; });
        return next;
      });
    } catch {}
  }, []);

  useEffect(() => {
    // Ensure currently selected option is present in options, so Select can render its label
    const currentId = (formValues as any)?.roc?.selectedByName || (formValues as any)?.roc?.selectedByInn || selectedPartyId || null;
    const nameOptsAugmented = (() => {
      const base = [...nameOptions];
      if (currentId && !base.some(o => o.value === String(currentId))) {
        const p = idToParty[String(currentId)];
        if (p) base.unshift({ value: String(currentId), label: `${p.name} (ИНН ${p.inn}${p.kpp ? ` / КПП ${p.kpp}` : ''})` });
      }
      return base;
    })();
    const innOptsAugmented = (() => {
      const base = [...innOptions];
      if (currentId && !base.some(o => o.value === String(currentId))) {
        const p = idToParty[String(currentId)];
        if (p) base.unshift({ value: String(currentId), label: `${p.inn}${p.kpp ? ` / ${p.kpp}` : ''} — ${p.name}` });
      }
      return base;
    })();

    setFormConfig({
      initialValues: DEFAULT_FORM,
      fields: [
        {
          name: 'roc.selectedByName',
          label: 'Контрагент (по названию)',
          type: 'select',
          searchable: true,
          options: nameOptsAugmented,
          onSearchChange: (s: string) => fetchSuggestions(s),
          onChange: async (val: string, setFieldValue?: (path: string, v: any) => void) => {
            const id = val as string;
            if (!id) return;
            setSelectedPartyId(id);
            setActivePartyId(id);
            const party = await enrichByInn(id);
            if (party && setFieldValue) {
              setFieldValue('roc.selectedByInn', id);
              setFieldValue('name', party.name || party.shortName || '');
            }
          },
          placeholder: 'Начните вводить название…',
        },
        {
          name: 'roc.selectedByInn',
          label: 'ИНН',
          type: 'select',
          searchable: true,
          options: innOptsAugmented,
          onSearchChange: (s: string) => fetchSuggestions(s),
          onChange: async (v: string, setFieldValue?: (path: string, v: any) => void) => {
            const id = v as string;
            if (!id) return;
            setSelectedPartyId(id);
            setActivePartyId(id);
            const party = await enrichByInn(id);
            if (party && setFieldValue) {
              setFieldValue('roc.selectedByName', id);
              setFieldValue('name', party.name || party.shortName || '');
            }
          },
          placeholder: 'Начните вводить ИНН…',
        },
        { name: 'typeContractId', label: 'Тип договора', type: 'select', options: types, placeholder: 'Выберите тип' },
        { name: 'statusContractId', label: 'Статус', type: 'select', options: statuses, placeholder: 'Выберите статус' },
        { name: 'contractNumber', label: 'Номер договора', type: 'text' },
        { name: 'dateContract', label: 'Дата договора', type: 'date' },
        { name: 'agreedTo', label: 'Срок действия до', type: 'date' },
        { name: 'shelfLife', label: 'Срок (мес.)', type: 'number' },
        { name: 'terminationLetter', label: 'Есть письмо о расторжении', type: 'boolean' },
        { name: 'terminationСonditions', label: 'Условия расторжения', type: 'textarea' },
        { name: 'peculiarities', label: 'Особенности', type: 'textarea' },
        { name: 'folderNo', label: '№ папки', type: 'text' },
        { name: 'attachments', label: 'Вложения (основные)', type: 'file', withDnd: true },
        { name: 'additionalAttachments', label: 'Доп. соглашения', type: 'file', withDnd: true },
      ],
    });
  }, [types, statuses, nameOptions, innOptions, idToParty, selectedPartyId, formValues]);

  const handleCreate = useCallback(async (values: any) => {
    const created = await fetchJson<RocData>(`${API}/accounting/roc`, { method: 'POST', body: JSON.stringify(values) });
    await loadList();
    return created || undefined;
  }, [fetchJson, loadList]);

  const handleUpdate = useCallback(async (values: any) => {
    if (!selected) return undefined;
    const updated = await fetchJson<RocData>(`${API}/accounting/roc/${selected.id}`, { method: 'PUT', body: JSON.stringify(values) });
    await loadList();
    return updated || selected;
  }, [fetchJson, loadList, selected]);

  // const handleDelete = useCallback(async () => {
  //   if (!selected) return;
  //   await fetchJson(`${API}/accounting/roc/${selected.id}`, { method: 'DELETE' });
  //   await loadList();
  // }, [fetchJson, loadList, selected]);

  const handleDeleteRow = useCallback(async (row: RocData) => {
    setSelected(row);
    await fetchJson(`${API}/accounting/roc/${row.id}`, { method: 'DELETE' });
    await loadList();
  }, [fetchJson, loadList]);

  const [modalOpened, modalHandlers] = useDisclosure(false);
  const [drawerOpened, drawerHandlers] = useDisclosure(false);
  const [viewModalOpened, viewModalHandlers] = useDisclosure(false);
  const [selectedView, setSelectedView] = useState<RocData | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const addAdditionalFiles = useCallback(async (rocId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = async () => {
      const files = Array.from(input.files || []);
      if (!files.length) return;
      const fd = new FormData();
      files.forEach(f => fd.append('files', f));
      fd.append('additional', 'true');
      await fetch(`${API}/accounting/roc/${rocId}/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: fd,
      }).catch(() => {});
      await loadList();
      // refresh current view data
      if (selectedView && selectedView.id === rocId) {
        const updated = (await fetchJson<RocData>(`${API}/accounting/roc/${rocId}`)) || null;
        setSelectedView(updated);
      }
    };
    input.click();
  }, [API, loadList, selectedView, fetchJson]);

  const groupedByDoc = useMemo(() => {
    const groups: Array<{
      key: string;
      title: string;
      subtitle?: string;
      items: RocData[];
    }> = [];
    const byKey: Record<string, number> = {};
    (data || []).forEach((row) => {
      const doc = row.doc;
      const key = doc?.id || `${doc?.inn || 'no-inn'}|${doc?.kpp || ''}|${doc?.name || row.name || 'unknown'}`;
      const title = doc?.fullName || doc?.name || row.name || 'Без названия';
      const subtitle = doc ? `ИНН ${doc.inn}${doc.kpp ? ` / КПП ${doc.kpp}` : ''}` : undefined;
      if (byKey[key] == null) {
        byKey[key] = groups.length;
        groups.push({ key, title, subtitle, items: [row] });
      } else {
        groups[byKey[key]].items.push(row);
      }
    });
    // Сортируем группы по названию
    groups.sort((a, b) => a.title.localeCompare(b.title));
    return groups;
  }, [data]);

  const openCreate = () => {
    setFormValues({
      ...DEFAULT_FORM,
      userAddId: user?.id || '',
      userUpdatedId: user?.id || '',
      attachments: [],
      additionalAttachments: [],
    });
    setSelected(null);
    setSelectedPartyId(null);
    setNameOptions([]);
    setInnOptions([]);
    setIdToParty({});
    setActivePartyId(null);
    modalHandlers.open();
    drawerHandlers.open();
  };
  const openEdit = (row: RocData) => {
    setSelected(row);
    setFormValues({
      ...DEFAULT_FORM,
      ...row,
      dateContract: row.dateContract ? dayjs(row.dateContract).format('YYYY-MM-DD') : '',
      agreedTo: row.agreedTo ? dayjs(row.agreedTo).format('YYYY-MM-DD') : '',
      userAddId: user?.id || DEFAULT_FORM.userAddId,
      userUpdatedId: user?.id || DEFAULT_FORM.userUpdatedId,
      roc: { selectedByName: '', selectedByInn: '' }
    });
    const allAtt: any[] = (row as any)?.rocAttachment || [];
    const base = allAtt.filter(a => !a.additional).map((a: any) => ({ 
      id: a.id, 
      source: a.source, 
      meta: {} 
    }));
    const adds = allAtt.filter(a => a.additional).map((a: any) => ({ 
      id: a.id, 
      source: a.source, 
      meta: {} 
    }));
    setFormValues((prev: any) => ({ ...prev, attachments: base, additionalAttachments: adds }));
    // Prefill multiselect from existing doc if present
    if (row.doc) {
      const id = `${row.doc.inn}|${row.doc.kpp || ''}|0`;
      const party = {
        inn: row.doc.inn,
        kpp: row.doc.kpp,
        ogrn: row.doc.ogrn,
        name: row.doc.fullName || row.doc.name,
        shortName: row.doc.name,
        address: row.doc.address,
        phone: (row.doc as any).phone,
        email: (row.doc as any).email,
        taxationSystem: (row.doc as any).taxationSystem,
        siEgrul: (row.doc as any).siEgrul,
        statusCode: (row.doc as any).statusCode,
        deStatusCode: (row.doc as any).deStatusCode,
        liquidationDate: (row.doc as any).liquidationDate,
        successorName: (row.doc as any).successorName,
        successorINN: (row.doc as any).successorINN,
      } as any;
      setIdToParty({ [id]: party });
      setNameOptions([{ value: id, label: `${party.name} (ИНН ${party.inn}${party.kpp ? ` / КПП ${party.kpp}` : ''})` }]);
      setInnOptions([{ value: id, label: `${party.inn}${party.kpp ? ` / ${party.kpp}` : ''} — ${party.name}` }]);
      setSelectedPartyId(id);
      setActivePartyId(id);
      setFormValues((prev: any) => ({ ...prev, roc: { selectedByName: id, selectedByInn: id } }));
    } else {
      setSelectedPartyId(null);
      setNameOptions([]);
      setInnOptions([]);
      setIdToParty({});
      setActivePartyId(null);
    }
    modalHandlers.open();
    drawerHandlers.open();
  };

  return (
    <DndProviderWrapper>
    <Box 
      style={{
        background: 'var(--theme-bg-primary)',
        minHeight: '100vh',
        padding: '20px'
      }}
    >
      {loading && <LoadingOverlay visible />}
      
      {/* Современный заголовок */}
      <Box
        style={{
          background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '24px',
          border: '1px solid var(--theme-border-primary)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Декоративные элементы */}
        <Box
          style={{
            position: 'absolute',
            top: '-20px',
            right: '-20px',
            width: '120px',
            height: '120px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '50%',
            zIndex: 1
          }}
        />
        <Box
          style={{
            position: 'absolute',
            bottom: '-30px',
            left: '-30px',
            width: '80px',
            height: '80px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '50%',
            zIndex: 1
          }}
        />
        
        <Group justify="space-between" align="center" style={{ position: 'relative', zIndex: 2 }}>
          <Group gap="16px" align="center">
            <Box
              style={{
                width: '48px',
                height: '48px',
                background: 'rgba(255, 255, 255, 0.2)',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px'
              }}
            >
              📋
            </Box>
            <Box>
              <Title 
                order={2} 
                style={{ 
                  color: 'white', 
                  margin: 0,
                  fontSize: '28px',
                  fontWeight: '700'
                }}
              >
                Реестр договоров
              </Title>
              <Text 
                style={{ 
                  color: 'rgba(255, 255, 255, 0.8)', 
                  fontSize: '16px',
                  marginTop: '4px'
                }}
              >
                Управление договорами и контрагентами
              </Text>
            </Box>
          </Group>
          
          <Tooltip label="Добавить договор">
            <ActionIcon 
              size="xl"
              radius="xl"
              onClick={openCreate}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                color: 'white',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                backdropFilter: 'blur(10px)',
                width: '48px',
                height: '48px'
              }}
            >
              <IconPlus size={24} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Box>
      <Tabs 
        value={activeTab} 
        onChange={(v) => setActiveTab((v as any) || 'list')}
        style={{ marginBottom: '24px' }}
      >
        <Tabs.List
          style={{
            background: 'var(--theme-bg-elevated)',
            borderRadius: '12px',
            padding: '4px',
            border: '1px solid var(--theme-border-primary)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)'
          }}
        >
          <Tabs.Tab 
            value="list"
            style={{
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '16px',
              padding: '12px 24px',
              transition: 'all 0.2s ease',
              background: activeTab === 'list' 
                ? 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))' 
                : 'transparent',
              color: activeTab === 'list' ? 'white' : 'var(--theme-text-primary)',
              border: 'none'
            }}
          >
            📊 Реестр
          </Tabs.Tab>
          <Tabs.Tab 
            value="byDoc"
            style={{
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '16px',
              padding: '12px 24px',
              transition: 'all 0.2s ease',
              background: activeTab === 'byDoc' 
                ? 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))' 
                : 'transparent',
              color: activeTab === 'byDoc' ? 'white' : 'var(--theme-text-primary)',
              border: 'none'
            }}
          >
            🏢 По контрагентам
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="list" pt="md">
          <Grid>
            <Grid.Col span={12}>
              <Box
                style={{
                  background: 'var(--theme-bg-elevated)',
                  borderRadius: '16px',
                  padding: '20px',
                  border: '1px solid var(--theme-border-primary)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
                  marginBottom: '20px'
                }}
              >
                <Group gap="12px" align="center" style={{ marginBottom: '16px' }}>
                  <Box
                    style={{
                      width: '32px',
                      height: '32px',
                      background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px'
                    }}
                  >
                    🔍
                  </Box>
                  <Text 
                    style={{ 
                      fontSize: '18px', 
                      fontWeight: '600',
                      color: 'var(--theme-text-primary)'
                    }}
                  >
                    Фильтры
                  </Text>
                </Group>
                <FilterGroup
                  filters={filtersConfig}
                  columnFilters={filters.column}
                  onColumnFiltersChange={(columnId, value) =>
                    setFilters(prev => ({
                      ...prev,
                      column: [
                        ...prev.column.filter(f => f.id !== columnId),
                        ...(value ? [{ id: columnId, value }] : []),
                      ],
                    }))
                  }
                />
              </Box>
            </Grid.Col>
            <Grid.Col span={12}>
              <Box
                style={{
                  background: 'var(--theme-bg-elevated)',
                  borderRadius: '16px',
                  border: '1px solid var(--theme-border-primary)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
                  overflow: 'hidden'
                }}
              >
                <TableComponent<RocData>
                  data={data}
                  columns={[
                    { 
                      header: 'Контрагент', 
                      accessorKey: 'name', 
                      cell: info => (
                        <Text 
                          style={{ 
                            fontWeight: '600',
                            color: 'var(--theme-text-primary)',
                            fontSize: '15px'
                          }}
                        >
                          {info.row.original.name}
                        </Text>
                      ) 
                    },
                    { 
                      header: 'Тип договора', 
                      accessorKey: 'typeContract.name', 
                      cell: info => (
                        <Badge
                          variant="light"
                          style={{
                            background: 'var(--color-primary-100)',
                            color: 'var(--color-primary-700)',
                            fontWeight: '500',
                            fontSize: '13px',
                            padding: '6px 12px',
                            borderRadius: '8px'
                          }}
                        >
                          {info.row.original.typeContract?.name || '-'}
                        </Badge>
                      ) 
                    },
                    { 
                      header: 'Статус', 
                      accessorKey: 'statusContract.name', 
                      cell: info => (
                        <Badge
                          variant="light"
                          style={{
                            background: 'var(--color-green-100)',
                            color: 'var(--color-green-700)',
                            fontWeight: '500',
                            fontSize: '13px',
                            padding: '6px 12px',
                            borderRadius: '8px'
                          }}
                        >
                          {info.row.original.statusContract?.name || '-'}
                        </Badge>
                      ) 
                    },
                    { 
                      header: 'Номер', 
                      accessorKey: 'contractNumber', 
                      cell: info => (
                        <Text 
                          style={{ 
                            color: 'var(--theme-text-secondary)',
                            fontSize: '14px',
                            fontFamily: 'monospace'
                          }}
                        >
                          {info.row.original.contractNumber || '-'}
                        </Text>
                      ) 
                    },
                    { 
                      header: 'Дата', 
                      accessorKey: 'dateContract', 
                      cell: info => (
                        <Text 
                          style={{ 
                            color: 'var(--theme-text-primary)',
                            fontSize: '14px',
                            fontWeight: '500'
                          }}
                        >
                          {info.row.original.dateContract ? dayjs(info.row.original.dateContract).format('DD.MM.YYYY') : '-'}
                        </Text>
                      ) 
                    },
                    { 
                      header: 'Действует до', 
                      accessorKey: 'agreedTo', 
                      cell: info => (
                        <Text 
                          style={{ 
                            color: 'var(--theme-text-primary)',
                            fontSize: '14px',
                            fontWeight: '500'
                          }}
                        >
                          {info.row.original.agreedTo ? dayjs(info.row.original.agreedTo).format('DD.MM.YYYY') : '-'}
                        </Text>
                      ) 
                    },
                    { 
                      header: 'Действия', 
                      accessorKey: 'id', 
                      cell: info => (
                        <Group gap={8}>
                          <Tooltip label="Редактировать">
                            <ActionIcon 
                              size="sm" 
                              variant="light" 
                              onClick={(e) => { e.stopPropagation(); openEdit(info.row.original); }}
                              style={{
                                background: 'var(--color-blue-100)',
                                color: 'var(--color-blue-700)',
                                border: '1px solid var(--color-blue-200)',
                                borderRadius: '8px'
                              }}
                            >
                              <IconPencil size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Удалить">
                            <ActionIcon 
                              size="sm" 
                              color="red" 
                              variant="light" 
                              onClick={async (e) => { e.stopPropagation(); await handleDeleteRow(info.row.original); }}
                              style={{
                                background: 'var(--color-red-100)',
                                color: 'var(--color-red-700)',
                                border: '1px solid var(--color-red-200)',
                                borderRadius: '8px'
                              }}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      ) 
                    },
                  ]}
                  columnFilters={filters.column}
                  sorting={[] as any}
                  onColumnFiltersChange={() => {}}
                  onSortingChange={() => {}}
                  onRowClick={(row) => { setSelectedView(row); viewModalHandlers.open(); }}
                />
              </Box>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        <Tabs.Panel value="byDoc" pt="md">
          <Box
            style={{
              background: 'var(--theme-bg-elevated)',
              borderRadius: '16px',
              border: '1px solid var(--theme-border-primary)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
              overflow: 'hidden'
            }}
          >
            <Accordion 
              multiple
              styles={{
                root: {
                  background: 'transparent'
                },
                item: {
                  border: 'none',
                  borderBottom: '1px solid var(--theme-border-secondary)',
                  '&:last-child': {
                    borderBottom: 'none'
                  }
                },
                control: {
                  padding: '20px',
                  background: 'transparent',
                  '&:hover': {
                    background: 'var(--theme-bg-secondary)'
                  }
                },
                panel: {
                  padding: '0 20px 20px 20px',
                  background: 'var(--theme-bg-secondary)'
                }
              }}
            >
              {groupedByDoc.map((g) => (
                <Accordion.Item key={g.key} value={g.key}>
                  <Accordion.Control>
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap="16px" align="center">
                        <Box
                          style={{
                            width: '40px',
                            height: '40px',
                            background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                            borderRadius: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '18px'
                          }}
                        >
                          🏢
                        </Box>
                        <Box>
                          <Text 
                            fw={600} 
                            style={{ 
                              fontSize: '16px',
                              color: 'var(--theme-text-primary)'
                            }}
                          >
                            {g.title}
                          </Text>
                          {g.subtitle && (
                            <Text 
                              size="sm" 
                              style={{ 
                                color: 'var(--theme-text-secondary)',
                                marginTop: '2px'
                              }}
                            >
                              {g.subtitle}
                            </Text>
                          )}
                        </Box>
                      </Group>
                      <Badge
                        variant="light"
                        style={{
                          background: 'var(--color-primary-100)',
                          color: 'var(--color-primary-700)',
                          fontWeight: '600',
                          fontSize: '13px',
                          padding: '8px 16px',
                          borderRadius: '20px'
                        }}
                      >
                        Договоров: {g.items.length}
                      </Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Box>
                      {g.items.map((row) => (
                        <Box
                          key={row.id}
                          style={{
                            background: 'var(--theme-bg-elevated)',
                            borderRadius: '12px',
                            padding: '16px',
                            marginBottom: '12px',
                            border: '1px solid var(--theme-border-primary)',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                              transform: 'translateY(-2px)',
                              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.1)'
                            }
                          }}
                          onClick={() => { setSelectedView(row); viewModalHandlers.open(); }}
                        >
                          <Group justify="space-between" align="center">
                            <Group gap={16}>
                              <Box
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  background: 'linear-gradient(135deg, var(--color-blue-500), var(--color-blue-600))',
                                  borderRadius: '8px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '14px'
                                }}
                              >
                                📄
                              </Box>
                              <Box>
                                <Text 
                                  fw={500} 
                                  style={{ 
                                    fontSize: '15px',
                                    color: 'var(--theme-text-primary)',
                                    marginBottom: '4px'
                                  }}
                                >
                                  {row.name}
                                </Text>
                                <Group gap={16} wrap="wrap">
                                  <Text 
                                    size="sm" 
                                    style={{ 
                                      color: 'var(--theme-text-secondary)',
                                      fontFamily: 'monospace'
                                    }}
                                  >
                                    № {row.contractNumber || '-'}
                                  </Text>
                                  <Text 
                                    size="sm" 
                                    style={{ 
                                      color: 'var(--theme-text-secondary)'
                                    }}
                                  >
                                    от {row.dateContract ? dayjs(row.dateContract).format('DD.MM.YYYY') : '-'}
                                  </Text>
                                  <Text 
                                    size="sm" 
                                    style={{ 
                                      color: 'var(--theme-text-secondary)'
                                    }}
                                  >
                                    до {row.agreedTo ? dayjs(row.agreedTo).format('DD.MM.YYYY') : '-'}
                                  </Text>
                                </Group>
                              </Box>
                            </Group>
                            <Group gap={8}>
                              <Tooltip label="Редактировать">
                                <ActionIcon 
                                  size="sm" 
                                  variant="light" 
                                  onClick={(e) => { e.stopPropagation(); openEdit(row); }}
                                  style={{
                                    background: 'var(--color-blue-100)',
                                    color: 'var(--color-blue-700)',
                                    border: '1px solid var(--color-blue-200)',
                                    borderRadius: '8px'
                                  }}
                                >
                                  <IconPencil size={16} />
                                </ActionIcon>
                              </Tooltip>
                              <Tooltip label="Удалить">
                                <ActionIcon 
                                  size="sm" 
                                  color="red" 
                                  variant="light" 
                                  onClick={(e) => { e.stopPropagation(); handleDeleteRow(row); }}
                                  style={{
                                    background: 'var(--color-red-100)',
                                    color: 'var(--color-red-700)',
                                    border: '1px solid var(--color-red-200)',
                                    borderRadius: '8px'
                                  }}
                                >
                                  <IconTrash size={16} />
                                </ActionIcon>
                              </Tooltip>
                            </Group>
                          </Group>
                        </Box>
                      ))}
                    </Box>
                  </Accordion.Panel>
                </Accordion.Item>
              ))}
            </Accordion>
          </Box>
        </Tabs.Panel>
      </Tabs>

      <DynamicFormModal
        opened={modalOpened}
        onClose={() => { modalHandlers.close(); drawerHandlers.close(); }}
        title={selected ? 'Редактирование ROC' : 'Создание ROC'}
        mode={selected ? 'edit' : 'create'}
        fields={formConfig.fields}
        initialValues={formValues}
        onSubmit={async (vals) => {
          const chosenId = vals?.roc?.selectedByInn || vals?.roc?.selectedByName || selectedPartyId;
          const doc = chosenId ? idToParty[chosenId] : undefined;
          const payloadBase = doc ? { ...vals, doc } : vals;
          const payload = {
            ...payloadBase,
            userAddId: payloadBase.userAddId || user?.id || '',
            userUpdatedId: payloadBase.userUpdatedId || user?.id || '',
            name: payloadBase.name || (doc?.name ?? ''),
          };
          const saved = selected ? await handleUpdate(payload) : await handleCreate(payload);
          const targetId = selected?.id || saved?.id;
          if (targetId) {
            const baseFiles: File[] = (vals as any).attachments?.map((a: any) => a.source).filter(Boolean) || [];
            const addFiles: File[] = (vals as any).additionalAttachments?.map((a: any) => a.source).filter(Boolean) || [];
            if (baseFiles.length) {
              const fd = new FormData();
              baseFiles.forEach(f => fd.append('files', f));
              fd.append('additional', 'false');
              await fetch(`${API}/accounting/roc/${targetId}/attachments`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
                body: fd,
              }).catch(() => {});
            }
            if (addFiles.length) {
              const fd2 = new FormData();
              addFiles.forEach(f => fd2.append('files', f));
              fd2.append('additional', 'true');
              await fetch(`${API}/accounting/roc/${targetId}/attachments`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
                body: fd2,
              }).catch(() => {});
            }
          }
          modalHandlers.close();
          drawerHandlers.close();
        }}
      />

      <Drawer opened={drawerOpened} onClose={drawerHandlers.close} position="right" withOverlay={false} lockScroll={false} title="Контрагент" size={460} zIndex={2100}>
        {!activePartyId || !idToParty[activePartyId] ? (
          <Text size="sm" c="dimmed">Контрагент не выбран</Text>
        ) : (
          <>
            <Text fw={700} mb={6}>{idToParty[activePartyId].name}</Text>
            <Text size="sm" c="dimmed" mb={8}>{idToParty[activePartyId].address}</Text>
            <Group gap={12} wrap="wrap">
              <Text size="sm">ИНН: {idToParty[activePartyId].inn}</Text>
              {idToParty[activePartyId].kpp && <Text size="sm">КПП: {idToParty[activePartyId].kpp}</Text>}
              {idToParty[activePartyId].ogrn && <Text size="sm">ОГРН: {idToParty[activePartyId].ogrn}</Text>}
            </Group>
            {(idToParty[activePartyId].phone || idToParty[activePartyId].email) && (
              <Group gap={12} wrap="wrap" mt={8}>
                {idToParty[activePartyId].phone && <Text size="sm">Тел.: {idToParty[activePartyId].phone}</Text>}
                {idToParty[activePartyId].email && <Text size="sm">Email: {idToParty[activePartyId].email}</Text>}
              </Group>
            )}
            {(idToParty[activePartyId].taxationSystem || idToParty[activePartyId].siEgrul) && (
              <Group gap={12} wrap="wrap" mt={8}>
                {idToParty[activePartyId].taxationSystem && <Text size="sm">СНО: {idToParty[activePartyId].taxationSystem}</Text>}
                {idToParty[activePartyId].siEgrul && <Text size="sm">ЕГРЮЛ: {idToParty[activePartyId].siEgrul}</Text>}
              </Group>
            )}
            {(idToParty[activePartyId].statusCode || idToParty[activePartyId].deStatusCode) && (
              <Group gap={12} wrap="wrap" mt={8}>
                {typeof idToParty[activePartyId].statusCode !== 'undefined' && <Text size="sm">Код статуса: {idToParty[activePartyId].statusCode}</Text>}
                {idToParty[activePartyId].deStatusCode && <Text size="sm">Статус: {idToParty[activePartyId].deStatusCode}</Text>}
              </Group>
            )}
            {(idToParty[activePartyId].liquidationDate) && (
              <Text size="sm" mt={8}>Ликвидация: {dayjs(idToParty[activePartyId].liquidationDate).isValid() ? dayjs(idToParty[activePartyId].liquidationDate).format('DD.MM.YYYY') : idToParty[activePartyId].liquidationDate}</Text>
            )}
            {(idToParty[activePartyId].successorName || idToParty[activePartyId].successorINN) && (
              <Group gap={12} wrap="wrap" mt={8}>
                {idToParty[activePartyId].successorName && <Text size="sm">Правопреемник: {idToParty[activePartyId].successorName}</Text>}
                {idToParty[activePartyId].successorINN && <Text size="sm">ИНН правопреемника: {idToParty[activePartyId].successorINN}</Text>}
              </Group>
            )}
          </>
        )}
      </Drawer>

      <DynamicFormModal
        opened={viewModalOpened}
        onClose={viewModalHandlers.close}
        title="Просмотр договора"
        mode="view"
        initialValues={{
          ...(selectedView || {}),
          attachments: (selectedView as any)?.rocAttachment || [],
        }}
        hideDefaultViewAttachments
        viewSecondaryAttachments={[
          { title: 'Доп. соглашения', list: ((selectedView as any)?.rocAttachment || []).filter((a: any) => a.additional) },
        ]}
        viewExtraContent={(vals) => {
          const all = (vals as any)?.rocAttachment || [];
          const base = all.filter((a: any) => !a.additional);
          const additional = all.filter((a: any) => a.additional);
          return (
            <Stack>
              <Box>
                <Group justify="space-between" mb={6}>
                  <Text fw={600}>Основные вложения</Text>
                </Group>
                {base.length === 0 ? (
                  <Text size="sm" c="dimmed">Нет вложений</Text>
                ) : (
                  <Stack gap="xs">{base.map((att: any) => (
                    <Paper key={att.id} p="sm" withBorder>
                      <Group justify="space-between" align="center">
                        <Group gap="sm" align="center" onClick={() => setPreviewId(att.id)} style={{ cursor: 'pointer' }}>
                          <img 
                            src={`${API}/${String(att.source || '').replace(/\\/g,'/')}`} 
                            alt={String(att.source || '').split('/').pop() || 'Файл'} 
                            style={{ height: 60, width: 100, objectFit: 'contain', borderRadius: 6 }} 
                          />
                          <Text size="sm" c="dimmed">Предпросмотр</Text>
                        </Group>
                        <Group gap="sm">
                          <Text size="sm">{String(att.source || '').split('/').pop()}</Text>
                          <ActionIcon component="a" href={`${API}/${String(att.source || '').replace(/\\/g,'/')}`} target="_blank" rel="noreferrer">
                            <IconDownload size={16} />
                          </ActionIcon>
                        </Group>
                      </Group>
                    </Paper>
                  ))}</Stack>
                )}
              </Box>
              <Box>
                <Group justify="space-between" mb={6}>
                  <Text fw={600}>Доп. соглашения</Text>
                  {selectedView && (
                    <Button size="xs" onClick={() => addAdditionalFiles(selectedView.id)}>Добавить</Button>
                  )}
                </Group>
                {additional.length === 0 ? (
                  <Text size="sm" c="dimmed">Нет доп. соглашений</Text>
                ) : (
                  <Stack gap="xs">{additional.map((att: any) => (
                    <Paper key={att.id} p="sm" withBorder>
                      <Group justify="space-between" align="center">
                        <Group gap="sm" align="center" onClick={() => setPreviewId(att.id)} style={{ cursor: 'pointer' }}>
                          <img 
                            src={`${API}/${String(att.source || '').replace(/\\/g,'/')}`} 
                            alt={String(att.source || '').split('/').pop() || 'Файл'} 
                            style={{ height: 60, width: 100, objectFit: 'contain', borderRadius: 6 }} 
                          />
                          <Text size="sm" c="dimmed">Предпросмотр</Text>
                        </Group>
                        <Group gap="sm">
                          <Text size="sm">{String(att.source || '').split('/').pop()}</Text>
                          <ActionIcon component="a" href={`${API}/${String(att.source || '').replace(/\\/g,'/')}`} target="_blank" rel="noreferrer">
                            <IconDownload size={16} />
                          </ActionIcon>
                        </Group>
                      </Group>
                    </Paper>
                  ))}</Stack>
                )}
              </Box>
            </Stack>
          );
        }}
        viewFieldsConfig={[
          { label: 'Контрагент', value: (it) => it?.name || '-' },
          { label: 'Тип договора', value: (it) => it?.typeContract?.name || '-' },
          { label: 'Статус', value: (it) => it?.statusContract?.name || '-' },
          { label: 'Номер договора', value: (it) => it?.contractNumber || '-' },
          { label: 'Дата договора', value: (it) => it?.dateContract ? dayjs(it.dateContract).format('DD.MM.YYYY') : '-' },
          { label: 'Действует до', value: (it) => it?.agreedTo ? dayjs(it.agreedTo).format('DD.MM.YYYY') : '-' },
          { label: 'Контрагент (Doc)', value: (it) => it?.doc?.fullName || it?.doc?.name || '-' },
          { label: 'ИНН/КПП', value: (it) => it?.doc ? `${it.doc.inn}${it.doc.kpp ? ` / ${it.doc.kpp}` : ''}` : '-' },
          { label: 'ОГРН', value: (it) => it?.doc?.ogrn || '-' },
          { label: 'Адрес', value: (it) => it?.doc?.address || '-' },
        ]}
      />

      {/* FilePreviewModal для просмотра файлов */}
      <FilePreviewModal
        opened={!!previewId}
        onClose={() => setPreviewId(null)}
        attachments={(() => {
          const all = (selectedView as any)?.rocAttachment || [];
          return all.map((att: any) => ({
            id: String(att.id || `temp-${Math.random().toString(36).slice(2, 11)}`),
            name: String(att.source || '').split('/').pop() || 'Файл',
            url: `${API}/${String(att.source || '').replace(/\\/g,'/')}`,
            source: String(att.source || ''),
          }));
        })()}
        initialIndex={(() => {
          if (!previewId) return 0;
          const all = (selectedView as any)?.rocAttachment || [];
          return all.findIndex((att: any) => att.id === previewId);
        })()}
      />
    </Box>
    </DndProviderWrapper>
  );
}