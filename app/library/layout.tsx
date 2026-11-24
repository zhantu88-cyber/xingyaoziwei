/**
 * 古籍库入口已暂时关闭。
 *
 * 整个 /library 目录（含子页面）统一重定向回首页，代码完整保留，
 * 后续若需重新开放，删除本文件即可恢复全部页面。
 */
import { redirect } from 'next/navigation';

export default function LibraryLayout() {
  redirect('/');
}
