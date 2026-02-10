'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function GuestPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/legacy-guest/ready');
  }, [router]);

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center">
      <div className="text-white/40">Loading...</div>
    </div>
  );
}
