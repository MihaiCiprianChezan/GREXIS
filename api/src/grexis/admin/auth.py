from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

SESSION_MAX_AGE = 8 * 60 * 60  # 8 hours


def create_session_token(secret: str) -> str:
    s = URLSafeTimedSerializer(secret)
    return s.dumps({"role": "admin"})


def verify_session_token(token: str, secret: str) -> bool:
    s = URLSafeTimedSerializer(secret)
    try:
        s.loads(token, max_age=SESSION_MAX_AGE)
        return True
    except (BadSignature, SignatureExpired):
        return False
