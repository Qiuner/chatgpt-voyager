/**
 * @module global.d.ts
 * 职责：声明全局资源模块类型，供 TypeScript 编译识别。
 * 主要导出：类型声明（无运行时导出）。
 */
declare module '*.svg' {
  import React = require('react');
  export const ReactComponent: React.SFC<React.SVGProps<SVGSVGElement>>;
  const src: string;
  export default src;
}

declare module '*.json' {
  const content: string;
  export default content;
}
