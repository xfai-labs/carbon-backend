import moment from 'moment';

export function toTimestamp(date: Date): number {
  return parseInt(moment(date).format('X'));
}

// indexBy
export function indexBy<T>(arr: T[], key: string): Record<string, T> {
  return arr.reduce((acc, item) => {
    acc[item[key]] = item;
    return acc;
  }, {});
}
