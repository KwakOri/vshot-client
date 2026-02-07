'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function GuestV3Page() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/festa-guest/ready');
  }, [router]);

  return (
    <div className="min-h-screen bg-light flex items-center justify-center">
      <div className="text-dark">Loading...</div>
    </div>
  );
}
