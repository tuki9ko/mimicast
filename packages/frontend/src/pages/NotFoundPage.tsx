import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="centered">
      <div className="card login">
        <h1 className="login__title">404</h1>
        <p className="login__subtitle">ページが見つかりません</p>
        <Link className="button button--primary" to="/">
          動画一覧へ
        </Link>
      </div>
    </div>
  );
}
