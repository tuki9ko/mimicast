import { useNavigate } from "react-router-dom";

import { Button } from "../components/Button.tsx";
import { UploadForm } from "../features/upload/components/UploadForm.tsx";

export function VideoUploadPage() {
  const navigate = useNavigate();

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <Button variant="ghost" onClick={() => void navigate("/")}>
            ← 一覧へ戻る
          </Button>
          <h1 className="page__title">アップロード</h1>
        </div>
      </div>

      <UploadForm
        onUploaded={(video) => {
          void navigate(`/videos/${video.id}`);
        }}
      />
    </div>
  );
}
