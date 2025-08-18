import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { suggestParty, findPartyByInn } from '../../services/dadata.js';
import { z } from 'zod';
import { prisma } from '../../server.js';
import fs from 'fs/promises';
import { createUploader } from '../../middleware/uploadFactory.js';
const uploadRoc = createUploader({ dest: './public/accounting/roc', limits: { fileSize: 50 * 1024 * 1024 } });

// Type chapters for ROC (align with RK approach: filter by chapter name; model filter optional)
const ROC_TYPE_CHAPTER = 'Тип договора';
const ROC_STATUS_CHAPTER = 'Статус договора';

const RocSchema = z.object({
  userAddId: z.string(),
  userUpdatedId: z.string().optional(),
  name: z.string().min(1),
  typeTerm: z.enum(['Urgent', 'Extended', 'Perpetual', 'LongTerm']).optional(),
  contractNumber: z.string().optional(),
  dateContract: z.string().optional(),
  agreedTo: z.string().optional(),
  shelfLife: z.coerce.number().int().optional(),
  typeContractId: z.string().optional(),
  statusContractId: z.string().optional(),
  terminationLetter: z.boolean().optional(),
  terminationСonditions: z.string().optional(),
  peculiarities: z.string().optional(),
  folderNo: z.string().optional(),
  dateSendCorrespondence: z.string().optional(),
  doc: z
    .object({
      fullName: z.string().optional(),
      name: z.string().optional(),
      address: z.string().optional(),
      inn: z.coerce.number().optional(),
      ogrn: z.string().optional(),
      kpp: z.string().optional(),
      taxationSystem: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      siEgrul: z.string().optional(),
      statusCode: z.coerce.number().optional(),
      deStatusCode: z.string().optional(),
      liquidationDate: z.string().datetime().optional(),
      successorName: z.string().optional(),
      successorINN: z.string().optional(),
    })
    .optional(),
});

export const getRocList = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const list = await (prisma as any).roc.findMany({
      include: {
        doc: true,
        typeContract: true,
        statusContract: true,
        rocAttachment: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json(list);
    return;
  } catch (e) {
    next(e);
  }
};

export const getRocById = async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const record = await (prisma as any).roc.findUnique({
      where: { id },
      include: {
        doc: true,
        typeContract: true,
        statusContract: true,
        rocAttachment: true,
      },
    });
    if (!record) { res.status(404).json({ error: 'ROC not found' }); return; }
    res.status(200).json(record);
    return;
  } catch (e) {
    next(e);
  }
};

async function findOrCreateDoc(data: any) {
  if (!data) return null;
  if (!data.inn) return null;
  const kpp = data.kpp || undefined;
  const existing = await (prisma as any).doc.findFirst({ where: { inn: String(data.inn), ...(kpp ? { kpp } : {}) } });
  if (existing) {
    // Prepare partial update only for provided, non-empty values
    const updateData: any = {};
    const setIf = (cond: any, key: string, value: any) => { if (cond) updateData[key] = value; };
    setIf(data.fullName || data.name, 'fullName', data.fullName || data.name);
    setIf(data.name || data.shortName, 'name', data.name || data.shortName);
    setIf(data.address, 'address', data.address);
    setIf(data.ogrn, 'ogrn', data.ogrn);
    setIf(data.kpp, 'kpp', data.kpp);
    setIf(data.taxationSystem, 'taxationSystem', data.taxationSystem);
    setIf(data.phone, 'phone', data.phone);
    setIf(data.email, 'email', data.email);
    setIf(data.siEgrul, 'siEgrul', data.siEgrul);
    if (typeof data.statusCode !== 'undefined' && data.statusCode !== null) {
      updateData.statusCode = typeof data.statusCode === 'number' ? data.statusCode : Number(data.statusCode);
    }
    setIf(data.deStatusCode, 'deStatusCode', data.deStatusCode);
    if (data.liquidationDate) setIf(true, 'liquidationDate', new Date(data.liquidationDate));
    setIf(data.successorName, 'successorName', data.successorName);
    setIf(data.successorINN, 'successorINN', data.successorINN);
    if (Object.keys(updateData).length > 0) {
      await (prisma as any).doc.update({ where: { id: existing.id }, data: updateData });
    }
    return existing;
  }
  return (prisma as any).doc.create({
    data: {
      fullName: data.fullName || data.name || '',
      name: data.name || data.fullName || '',
      address: data.address || '',
      inn: String(data.inn),
      ogrn: data.ogrn || '',
      kpp: data.kpp || '',
      taxationSystem: data.taxationSystem || '',
      phone: data.phone || '',
      email: data.email || '',
      siEgrul: data.siEgrul || '',
      statusCode: typeof data.statusCode === 'number' ? data.statusCode : (data.statusCode ? Number(data.statusCode) : 0),
      deStatusCode: data.deStatusCode || '',
      liquidationDate: data.liquidationDate ? new Date(data.liquidationDate) : new Date(),
      successorName: data.successorName || '',
      successorINN: data.successorINN || '',
    },
  });
}

export const createRoc = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = RocSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: body.userAddId } });
    if (!user) { res.status(400).json({ error: 'User not found' }); return; }

    let docId: string | undefined = undefined;
    if (body.doc) {
      const doc = await findOrCreateDoc(body.doc);
      if (doc) docId = doc.id;
    }

    const created = await (prisma as any).roc.create({
      data: {
        userAdd: { connect: { id: body.userAddId } },
        ...(body.userUpdatedId ? { userUpdated: { connect: { id: body.userUpdatedId } } } : { userUpdated: { connect: { id: body.userAddId } } }),
        name: body.name,
        typeTerm: (body.typeTerm as any) || 'Perpetual',
        contractNumber: body.contractNumber || '',
        dateContract: body.dateContract ? new Date(body.dateContract) : undefined,
        agreedTo: body.agreedTo ? new Date(body.agreedTo) : undefined,
        shelfLife: body.shelfLife || 0,
        ...(body.typeContractId ? { typeContract: { connect: { id: body.typeContractId } } } : {}),
        ...(body.statusContractId ? { statusContract: { connect: { id: body.statusContractId } } } : {}),
        terminationLetter: body.terminationLetter || false,
        terminationСonditions: body.terminationСonditions || '',
        peculiarities: body.peculiarities || '',
        folderNo: body.folderNo || '',
        dateSendCorrespondence: body.dateSendCorrespondence ? new Date(body.dateSendCorrespondence) : new Date(),
        ...(docId ? { doc: { connect: { id: docId } } } : {}),
      },
      include: { doc: true },
    });

    res.status(201).json(created);
    return;
  } catch (e) {
    next(e);
  }
};

export const updateRoc = async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const body = RocSchema.partial().parse(req.body);

    let connectDoc: any = {};
    if (body.doc) {
      const doc = await findOrCreateDoc(body.doc);
      if (doc) connectDoc = { doc: { connect: { id: doc.id } } };
    }

    const updated = await (prisma as any).roc.update({
      where: { id },
      data: {
        ...(body.userUpdatedId ? { userUpdated: { connect: { id: body.userUpdatedId } } } : {}),
        ...(body.name ? { name: body.name } : {}),
        ...(body.typeTerm ? { typeTerm: body.typeTerm as any } : {}),
        ...(body.contractNumber ? { contractNumber: body.contractNumber } : {}),
        ...(body.dateContract ? { dateContract: new Date(body.dateContract) } : {}),
        ...(body.agreedTo ? { agreedTo: new Date(body.agreedTo) } : {}),
        ...(typeof body.shelfLife === 'number' ? { shelfLife: body.shelfLife } : {}),
        ...(body.typeContractId ? { typeContract: { connect: { id: body.typeContractId } } } : {}),
        ...(body.statusContractId ? { statusContract: { connect: { id: body.statusContractId } } } : {}),
        ...(typeof body.terminationLetter === 'boolean' ? { terminationLetter: body.terminationLetter } : {}),
        ...(body.terminationСonditions ? { terminationСonditions: body.terminationСonditions } : {}),
        ...(body.peculiarities ? { peculiarities: body.peculiarities } : {}),
        ...(body.folderNo ? { folderNo: body.folderNo } : {}),
        ...(body.dateSendCorrespondence ? { dateSendCorrespondence: new Date(body.dateSendCorrespondence) } : {}),
        ...connectDoc,
      },
      include: { doc: true },
    });
    res.status(200).json(updated);
    return;
  } catch (e) {
    next(e);
  }
};

export const deleteRoc = async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    // Удаляем только запись ROC и её вложения/связи, Doc остаётся нетронутым
    await (prisma as any).roc.delete({ where: { id } });
    res.status(204).end();
    return;
  } catch (e) {
    next(e);
  }
};

export const getRocTypes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const types = await prisma.type.findMany({
      where: {
        chapter: ROC_TYPE_CHAPTER,
        ...(req.query.model_uuid ? { model_uuid: String(req.query.model_uuid) } : {}),
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, colorHex: true },
    });
    res.status(200).json(types);
    return;
  } catch (e) {
    next(e);
  }
};

export const getRocStatuses = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const statuses = await prisma.type.findMany({
      where: {
        chapter: ROC_STATUS_CHAPTER,
        ...(req.query.model_uuid ? { model_uuid: String(req.query.model_uuid) } : {}),
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, colorHex: true },
    });
    res.status(200).json(statuses);
    return;
  } catch (e) {
    next(e);
  }
};

// --- Attachments ---
export const addRocAttachments = [
  uploadRoc.array('files'),
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const rocId = req.params.id;
      // Ensure ROC exists and pick a valid user id for FK
      const roc = await (prisma as any).roc.findUnique({ where: { id: rocId }, select: { id: true, userAddId: true } });
      if (!roc) { res.status(404).json({ error: 'ROC not found' }); return; }
      const resolvedUserId = (req as any).user?.id || roc.userAddId;
      if (!resolvedUserId) { res.status(400).json({ error: 'userAddId required' }); return; }
      const additional = String(req.body.additional || 'false') === 'true';
      const files = (req.files as Express.Multer.File[]) || [];
      if (!files.length) { res.status(400).json({ error: 'No files uploaded' }); return; }
      const records = files.map((f) => ({
        source: f.path.replace(/\\/g, '/'),
        type: f.mimetype,
        recordId: rocId,
        userAddId: resolvedUserId,
        additional,
      }));
      await (prisma as any).rocAttachment.createMany({ data: records });
      res.status(201).json({ ok: true, count: records.length });
    } catch (e) { next(e); }
  }
];

export const deleteRocAttachment = async (req: Request<{ attId: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { attId } = req.params;
    const att = await (prisma as any).rocAttachment.findUnique({ where: { id: attId } });
    if (!att) { res.status(404).json({ error: 'Attachment not found' }); return; }
    try { await fs.unlink(att.source); } catch {}
    await (prisma as any).rocAttachment.delete({ where: { id: attId } });
    res.status(204).end();
  } catch (e) { next(e); }
};

// Dadata proxy (secure)
export const dadataPartyByInn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const inn = String(req.query.inn || '');
    if (!inn) { res.status(400).json({ error: 'inn required' }); return; }
    const first = await findPartyByInn(inn);
    res.status(200).json(first);
    return;
  } catch (e) {
    next(e);
  }
};

export const dadataSuggestParty = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = String(req.query.query || '').trim();
    if (!query) { res.status(400).json({ error: 'query required' }); return; }
    const items = await suggestParty(query);
    res.status(200).json(items);
    return;
  } catch (e) {
    next(e);
  }
};

// Weekly sync: ensure Doc entries exist/updated from ROC
export const weeklyRocDocSync = async () => {
  const rocs = await (prisma as any).roc.findMany({ include: { doc: true } });
  for (const roc of rocs) {
    if (!roc.docId) continue;
    await (prisma as any).doc.update({
      where: { id: roc.docId },
      data: { updatedAt: new Date() },
    }).catch(() => {});
  }
};


