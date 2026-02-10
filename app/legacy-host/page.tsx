'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HostPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/legacy-host/ready');
  }, [router]);

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center">
      <div className="text-white/40">Redirecting...</div>
    </div>
  );
}
