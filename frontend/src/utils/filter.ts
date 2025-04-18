import dayjs from "dayjs";
import isBetween from 'dayjs/plugin/isBetween';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';

// Extend dayjs with plugins
dayjs.extend(isBetween);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

export const dateRange = (row: { getValue: (arg0: any) => any; }, columnId: any, filterValue: { start: string | number | Date | dayjs.Dayjs | null | undefined; end: string | number | Date | dayjs.Dayjs | null | undefined; }) => {
  const date = row.getValue(columnId);
  if (!filterValue.start && !filterValue.end) return true;

  const start = filterValue.start ? dayjs(filterValue.start).startOf('day') : null;
  const end = filterValue.end ? dayjs(filterValue.end).endOf('day') : null;
  const rowDate = dayjs(date).startOf('day');

  if (start && end) {
    return rowDate.isBetween(start, end, null, '[]');
  } else if (start) {
    return rowDate.isSameOrAfter(start);
  } else if (end) {
    return rowDate.isSameOrBefore(end);
  }
  return true;
};

