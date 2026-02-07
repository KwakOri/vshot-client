'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HostPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/legacy-host/ready');
  }, [router]);

  return (
    <div className="min-h-screen bg-light flex items-center justify-center">
      <div className="text-dark/60">Redirecting...</div>
    </div>
  );
}
