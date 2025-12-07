import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-br from-purple-500 to-pink-500">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-2xl p-8">
        <h1 className="text-4xl font-bold text-center mb-4 text-gray-800">
          VShot v2
        </h1>
        <p className="text-center text-gray-600 mb-8">
          VR + 실사 합성 포토부스
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/host"
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-6 px-8 rounded-xl text-center transition-all transform hover:scale-105 shadow-lg"
          >
            <div className="text-2xl mb-2">🎮</div>
            <div className="text-xl">Host (VR)</div>
            <div className="text-sm opacity-80 mt-2">방 생성 및 화면 공유</div>
          </Link>

          <Link
            href="/guest"
            className="bg-pink-600 hover:bg-pink-700 text-white font-bold py-6 px-8 rounded-xl text-center transition-all transform hover:scale-105 shadow-lg"
          >
            <div className="text-2xl mb-2">📸</div>
            <div className="text-xl">Guest (Camera)</div>
            <div className="text-sm opacity-80 mt-2">방 참가 및 카메라 전송</div>
          </Link>
        </div>

        <div className="mt-8 p-4 bg-gray-100 rounded-lg">
          <h2 className="font-bold text-gray-800 mb-2">사용 방법</h2>
          <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
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
