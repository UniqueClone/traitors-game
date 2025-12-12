import type { SVGProps } from 'react';

const BackArrowIcon = (props: SVGProps<SVGSVGElement>) => (
    <svg
        xmlns='http://www.w3.org/2000/svg'
        width='12'
        height='12'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='2'
        strokeLinecap='round'
        strokeLinejoin='round'
        className='inline-block'
        {...props}
    >
        <path d='M15 18l-6-6 6-6' />
    </svg>
);

export default BackArrowIcon;
