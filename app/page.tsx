import Link from 'next/link';
import { Monitor, Camera } from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-light">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-lg p-8 border-2 border-neutral">
        <h1 className="text-4xl font-bold text-center mb-4 text-dark">
          VShot v2
        </h1>
        <p className="text-center text-dark/70 mb-8 text-lg">
          VR + 실사 합성 포토부스
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/host"
            className="bg-primary hover:bg-primary-dark text-white font-bold py-8 px-6 rounded-xl text-center transition-colors shadow-md flex flex-col items-center"
          >
            <Monitor size={48} className="mb-3" strokeWidth={2} />
            <div className="text-xl mb-2">Host (VR)</div>
            <div className="text-sm opacity-90">방 생성 및 화면 공유</div>
          </Link>

          <Link
            href="/guest"
            className="bg-secondary hover:bg-secondary-dark text-white font-bold py-8 px-6 rounded-xl text-center transition-colors shadow-md flex flex-col items-center"
          >
            <Camera size={48} className="mb-3" strokeWidth={2} />
            <div className="text-xl mb-2">Guest (Camera)</div>
            <div className="text-sm opacity-90">방 참가 및 카메라 전송</div>
          </Link>
        </div>

        <div className="mt-8 p-6 bg-neutral/30 rounded-lg border border-neutral">
          <h2 className="font-bold text-dark mb-3 text-lg">사용 방법</h2>
          <ol className="text-sm text-dark/80 space-y-2 list-decimal list-inside">
            <li>Host가 방을 생성하고 VR 화면을 공유합니다</li>
            <li>Guest가 방 ID를 입력해 참가하고 카메라를 활성화합니다</li>
            <li>Host가 촬영 버튼을 클릭하면 8장의 사진이 촬영됩니다</li>
            <li>촬영된 사진 중 4장을 선택해 프레임을 만듭니다</li>
            <li>완성된 프레임을 다운로드합니다</li>
          </ol>
        </div>
      </div>
    </main>
  );
}
