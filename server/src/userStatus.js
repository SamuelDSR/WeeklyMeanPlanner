// 账号审核状态，以及被拦下来时给用户看的提示文案
export const USER_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

const MESSAGES = {
  [USER_STATUS.PENDING]: '账号已提交，正在等待管理员审核通过',
  [USER_STATUS.REJECTED]: '账号未通过审核，如有疑问请联系管理员',
};

export function statusMessage(status) {
  return MESSAGES[status] || '账号当前不可用，请联系管理员';
}
