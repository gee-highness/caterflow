// src/components/DatePickerWrapper.tsx
'use client';

import dynamic from 'next/dynamic';
import { Input } from '@chakra-ui/react';

const DatePicker = dynamic<React.ComponentProps<any>>(
	() => import('react-datepicker').then((mod) => mod.default),
	{
		ssr: false,
		loading: () => <Input placeholder="Select date..." size="sm" />,
	}
);

export default DatePicker;