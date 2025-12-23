import { Image, Text } from '@mantine/core';
import dayjs from 'dayjs';
import { DynamicFormModal, FormConfig } from '../../../utils/formModal';
import { FilePreviewModal } from '../../../utils/FilePreviewModal';
import RKCalendarModal from './RKCalendar';
import { API } from '../../../config/constants';

interface RKModalsProps {
  // Modals state
  modals: {
    create: [boolean, { open: () => void; close: () => void }];
    edit: [boolean, { open: () => void; close: () => void }];
    view: [boolean, { open: () => void; close: () => void }];
    delete: [boolean, { open: () => void; close: () => void }];
    addDocuments: [boolean, { open: () => void; close: () => void }];
    addConstruction: [boolean, { open: () => void; close: () => void }];
  };
  
  // Form configs
  formConfigCreate: FormConfig;
  formConfigEdit: FormConfig;
  formConfigAddConstruction: FormConfig;
  
  // Form state
  rkForm: any;
  setRkForm: (form: any) => void;
  selectedRK: any;
  
  // Documents state
  constructionDocuments: Record<string, File[]>;
  setConstructionDocuments: React.Dispatch<React.SetStateAction<Record<string, File[]>>>;
  existingDocuments: Record<string, any[]>;
  setExistingDocuments: React.Dispatch<React.SetStateAction<Record<string, any[]>>>;
  removedDocuments: string[];
  setRemovedDocuments: React.Dispatch<React.SetStateAction<string[]>>;
  
  // Add documents modal state
  addDocsTargetConstruction: { rkId: string; constructionId: string } | null;
  setAddDocsTargetConstruction: (target: { rkId: string; constructionId: string } | null) => void;
  
  // Add construction modal state
  addConstructionTargetRK: string | null;
  setAddConstructionTargetRK: (rkId: string | null) => void;
  newConstructionForm: any;
  setNewConstructionForm: (form: any) => void;
  
  // Image preview modal state
  imagePreviewOpened: boolean;
  imagePreviewHandlers: { open: () => void; close: () => void };
  imagePreviewSrc: string | null;
  setImagePreviewSrc: (src: string | null) => void;
  
  // File preview modal state
  filePreviewOpened: boolean;
  filePreviewHandlers: { open: () => void; close: () => void };
  filePreviewData: { files: string[]; currentIndex: number } | null;
  
  // Calendar modal state
  calendarOpened: boolean;
  calendarHandlers: { open: () => void; close: () => void };
  rkData: any[];
  setRkData: React.Dispatch<React.SetStateAction<any[]>>;
  
  // Handlers
  handleFormSubmit: (values: any, mode: 'create' | 'edit') => Promise<void>;
  handleDeleteConfirm: () => Promise<void>;
  
  // User & API
  user: { id: string } | null;
  fetchData: (url: string, options?: any) => Promise<any>;
  showNotification: (type: 'success' | 'error', message: string) => void;
  
  // Default form
  DEFAULT_RK_FORM: any;
}

export const RKModals: React.FC<RKModalsProps> = ({
  modals,
  formConfigCreate,
  formConfigEdit,
  formConfigAddConstruction,
  rkForm,
  setRkForm,
  selectedRK,
  constructionDocuments,
  setConstructionDocuments,
  existingDocuments,
  setExistingDocuments,
  removedDocuments: _removedDocuments,
  setRemovedDocuments,
  addDocsTargetConstruction,
  setAddDocsTargetConstruction,
  addConstructionTargetRK,
  setAddConstructionTargetRK,
  newConstructionForm,
  setNewConstructionForm,
  imagePreviewOpened,
  imagePreviewHandlers,
  imagePreviewSrc,
  setImagePreviewSrc,
  filePreviewOpened,
  filePreviewHandlers,
  filePreviewData,
  calendarOpened,
  calendarHandlers,
  rkData,
  setRkData,
  handleFormSubmit,
  handleDeleteConfirm,
  user,
  fetchData,
  showNotification,
  DEFAULT_RK_FORM,
}) => {
  return (
    <>
      {/* Модальное окно создания */}
      <DynamicFormModal
        opened={modals.create[0]}
        onClose={() => {
          setRkForm(DEFAULT_RK_FORM);
          setConstructionDocuments({});
          modals.create[1].close();
        }}
        title="Добавить конструкцию"
        mode="create"
        fields={formConfigCreate.fields}
        initialValues={rkForm}
        onSubmit={(values) => handleFormSubmit(values, 'create')}
        fileAttachments={constructionDocuments}
        onFileAttachmentsChange={(fileId, documents) => {
          setConstructionDocuments(prev => ({
            ...prev,
            [fileId]: documents
          }));
        }}
        attachmentLabel="📎 Документы к конструкциям"
        attachmentAccept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
        fileCardTitle="Конструкция"
        size="95vw"
      />

      {/* Модальное окно редактирования */}
      <DynamicFormModal
        opened={modals.edit[0]}
        onClose={() => {
          setRkForm(DEFAULT_RK_FORM);
          setConstructionDocuments({});
          setExistingDocuments({});
          setRemovedDocuments([]);
          modals.edit[1].close();
        }}
        title="Редактировать конструкцию"
        mode="edit"
        fields={formConfigEdit.fields}
        initialValues={rkForm}
        onSubmit={(values) => handleFormSubmit(values, 'edit')}
        fileAttachments={constructionDocuments}
        onFileAttachmentsChange={(fileId, documents) => {
          setConstructionDocuments(prev => ({
            ...prev,
            [fileId]: documents
          }));
        }}
        attachmentLabel="📎 Документы к конструкциям"
        attachmentAccept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
        existingDocuments={existingDocuments}
        onDeleteExistingDocument={(fileId, documentId) => {
          setExistingDocuments(prev => {
            const newDocs = { ...prev };
            if (newDocs[fileId]) {
              newDocs[fileId] = newDocs[fileId].filter((doc: any) => doc.id !== documentId);
            }
            return newDocs;
          });
          setRemovedDocuments(prev => [...prev, documentId]);
        }}
        fileCardTitle="Конструкция"
        size="95vw"
      />

      {/* Модальное окно просмотра */}
      <DynamicFormModal
        opened={modals.view[0]}
        onClose={() => modals.view[1].close()}
        title="Просмотр конструкции"
        mode="view"
        initialValues={selectedRK || {}}
        viewFieldsConfig={[
          { label: 'РРС', value: (item) => item?.branch?.rrs || '-' },
          { label: 'Филиал', value: (item) => `${item?.branch?.name || '-'}${item?.branch?.code ? ` (${item.branch.code})` : ''}${item?.branch?.city ? ` - ${item.branch.city}` : ''}` },
          { label: 'Адрес', value: (item) => item?.branch?.address || '-' },
          { label: 'Статус', value: (item) => 
            item?.branch?.status === 0 ? 'Новый' : 
            item?.branch?.status === 1 ? 'Действующий' : 
            item?.branch?.status === 2 ? 'Закрыт' : 'Процедура закрытия'
          },
          { label: 'Тип конструкции', value: (item) => item?.typeStructure?.name || '-' },
          { label: 'Статус утверждения', value: (item) => item?.approvalStatus?.name || '-' },
          { label: 'Дата согласования', value: (item) => dayjs(item?.agreedTo).format('DD.MM.YYYY HH:mm') },
        ]}
      />

      {/* Модальное окно удаления */}
      <DynamicFormModal
        opened={modals.delete[0]}
        onClose={() => modals.delete[1].close()}
        title="Подтверждение удаления"
        mode="delete"
        initialValues={selectedRK || {}}
        onConfirm={handleDeleteConfirm}
      />

      {/* Модальное окно просмотра изображения */}
      <DynamicFormModal
        opened={imagePreviewOpened}
        onClose={() => {
          setImagePreviewSrc(null);
          imagePreviewHandlers.close();
        }}
        title="Просмотр изображения"
        mode="view"
        initialValues={{}}
        viewExtraContent={() => (
          imagePreviewSrc ? (
            <Image src={imagePreviewSrc} radius="sm" h={window.innerHeight ? Math.floor(window.innerHeight * 0.75) : 700} fit="contain" alt="attachment" />
          ) : (
            <Text size="sm" c="dimmed">Нет изображения</Text>
          )
        )}
        size="90vw"
      />

      {/* Модальное окно добавления документов к конструкции */}
      <DynamicFormModal
        opened={modals.addDocuments[0]}
        onClose={() => {
          setAddDocsTargetConstruction(null);
          modals.addDocuments[1].close();
        }}
        title="Добавить документы к конструкции"
        mode="create"
        fields={[
          {
            name: 'documents',
            label: 'Документы',
            type: 'file' as const,
            withDnd: true,
            accept: '.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx',
          }
        ]}
        initialValues={{ documents: [] }}
        attachmentsKey="documents"
        onSubmit={async (values: Record<string, any>) => {
          if (!addDocsTargetConstruction) return;
          const formData = new FormData();
          formData.append('parentAttachmentId', addDocsTargetConstruction.constructionId);
          formData.append('typeAttachment', 'DOCUMENT');
          formData.append('userAdd', user!.id);
          (values.documents || []).forEach((doc: { source: File | string }) => {
            if (doc.source instanceof File) {
              formData.append('attachments', doc.source);
            }
          });
          try {
            await fetchData(`${API}/add/rk/${addDocsTargetConstruction.rkId}/documents`, {
              method: 'POST',
              body: formData
            });
            showNotification('success', 'Документы успешно добавлены');
            modals.addDocuments[1].close();
            setAddDocsTargetConstruction(null);
            const response = await fetchData(`${API}/add/rk`);
            if (response) setRkData(response);
          } catch (error) {
            showNotification('error', 'Ошибка при добавлении документов');
          }
        }}
      />

      {/* Модальное окно добавления конструкции к РК */}
      <DynamicFormModal
        opened={modals.addConstruction[0]}
        onClose={() => {
          setAddConstructionTargetRK(null);
          setNewConstructionForm(null);
          setConstructionDocuments({});
          modals.addConstruction[1].close();
        }}
        title="Добавить конструкцию"
        mode="create"
        fields={formConfigAddConstruction.fields}
        initialValues={newConstructionForm || { attachments: [], removedAttachments: [] }}
        onSubmit={async (values: Record<string, any>) => {
          if (!addConstructionTargetRK) return;
          try {
            const formData = new FormData();
            formData.append('userAdd', user!.id);
            formData.append('rkId', addConstructionTargetRK);
            
            const { attachments, removedAttachments, ...cleanedValues } = values;
            Object.entries(cleanedValues).forEach(([key, value]) => {
              if (value !== undefined && value !== null && value !== '') {
                formData.append(key, String(value));
              }
            });
            
            // Первый файл - конструкция, остальные - документы к ней
            const allAttachments = attachments || [];
            
            allAttachments.forEach((att: any, index: number) => {
              if (att.source instanceof File) {
                if (index === 0) {
                  // Первый файл - конструкция
                  formData.append('attachments', att.source);
                  console.log('[RK] Sending attachmentsMeta:', att.meta);
                  if (att.meta) {
                    formData.append(`attachmentsMeta[0]`, JSON.stringify(att.meta));
                  }
                } else {
                  // Остальные файлы - документы к первой конструкции
                  formData.append(`documents_auto`, att.source);
                }
              }
            });
            
            // Также добавляем документы из секции "Дополнительные документы"
            Object.entries(constructionDocuments).forEach(([fileId, docs]) => {
              (docs as File[]).forEach((doc) => {
                formData.append(`documents_${fileId}`, doc);
              });
            });
            
            await fetchData(`${API}/add/rk/${addConstructionTargetRK}/construction`, {
              method: 'POST',
              body: formData
            });
            
            showNotification('success', 'Конструкция успешно добавлена');
            modals.addConstruction[1].close();
            setAddConstructionTargetRK(null);
            setNewConstructionForm(null);
            setConstructionDocuments({});
            
            const response = await fetchData(`${API}/add/rk`);
            if (response) setRkData(response);
          } catch (error) {
            showNotification('error', 'Ошибка при добавлении конструкции');
          }
        }}
        fileAttachments={constructionDocuments}
        onFileAttachmentsChange={(fileId, documents) => {
          setConstructionDocuments(prev => ({
            ...prev,
            [fileId]: documents
          }));
        }}
        fileCardTitle="Конструкция"
        size="95vw"
      />

      {/* Календарь */}
      <RKCalendarModal opened={calendarOpened} onClose={calendarHandlers.close} rkList={rkData} />

      {/* Просмотр файлов */}
      <FilePreviewModal
        opened={filePreviewOpened}
        onClose={filePreviewHandlers.close}
        attachments={filePreviewData?.files.map((file, index) => {
          const fileName = file.split('/').pop() || '';
          const ext = fileName.split('.').pop()?.toLowerCase() || '';
          const isPdf = ext === 'pdf';
          const mimeType = isPdf ? 'application/pdf' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
          return {
            id: `file-${index}`,
            source: file,
            name: fileName,
            mimeType
          };
        }) || []}
        initialIndex={filePreviewData?.currentIndex || 0}
      />
    </>
  );
};

export default RKModals;

