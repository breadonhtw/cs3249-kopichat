"""Small wrapper around the LLM APIs. All API calls go through this file.

Keys go in a .env file at the repository root (copy .env.example), never in this file.
Every call can fail (no network, bad key, rate limit, timeout); callers must
catch LLMError.
"""
import json
import os
import re

try:
    from dotenv import load_dotenv
    load_dotenv()          # reads .env if python-dotenv is installed
except ImportError:
    pass                   # then set the variables in your shell environment instead

# ---------------------------------------------------------------------------
# Defaults only. Keys and choices are read from the environment (.env): leave these as "".
# ---------------------------------------------------------------------------
LLM_PROVIDER = ""           # "" = whichever key is set (Anthropic first); LLM_PROVIDER in .env overrides
ANTHROPIC_API_KEY = ""      # read from ANTHROPIC_API_KEY in .env
OPENAI_API_KEY = ""         # read from OPENAI_API_KEY in .env
OPENAI_BASE_URL = "https://soclaas-api.comp.nus.edu.sg/v1"  # OPENAI_BASE_URL in .env overrides
LLM_MODEL = ""              # "" = the provider's default below; LLM_MODEL in .env overrides

DEFAULT_MODELS = {
    "anthropic": "claude-haiku-4-5-20251001",
    "openai": "default",  # SoCLaaS exposes its model as 'default'; real OpenAI users set LLM_MODEL.
}
TIMEOUT_SECONDS = float(os.environ.get("LLM_TIMEOUT") or "8")


class LLMError(Exception):
    """Anything went wrong talking to the LLM."""


def provider():
    # An LLM_PROVIDER environment variable wins, so tests can switch the LLM off.
    chosen = (os.environ.get("LLM_PROVIDER") or LLM_PROVIDER).strip().lower()
    if chosen:
        return chosen
    if ANTHROPIC_API_KEY or os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic"
    if OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY"):
        return "openai"
    return "none"


def _has_key(name):
    if name == "anthropic":
        return bool(ANTHROPIC_API_KEY or os.environ.get("ANTHROPIC_API_KEY"))
    if name == "openai":
        return bool(OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY"))
    return False


def enabled():
    """True only when the chosen provider is known and has a key, so a missing key reads as 'no LLM', not 'LLM down'."""
    name = provider()
    return name in DEFAULT_MODELS and _has_key(name)


def model():
    return LLM_MODEL or os.environ.get("LLM_MODEL") or DEFAULT_MODELS.get(provider(), "")


def describe():
    return f"{provider()} · {model()}" if enabled() else "none (add an API key)"


_clients = {}


def _client(name):
    """Create the SDK client once and reuse it."""
    if name not in _clients:
        if name == "anthropic":
            import anthropic
            _clients[name] = anthropic.Anthropic(
                api_key=ANTHROPIC_API_KEY or os.environ.get("ANTHROPIC_API_KEY"),
                timeout=TIMEOUT_SECONDS, max_retries=1,
            )
        elif name == "openai":
            import openai
            _clients[name] = openai.OpenAI(
                api_key=OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY"),
                base_url=os.environ.get("OPENAI_BASE_URL") or OPENAI_BASE_URL or None,
                timeout=TIMEOUT_SECONDS, max_retries=1,
            )
        else:
            raise LLMError(f"Unknown LLM_PROVIDER: {name!r}")
    return _clients[name]


_THINKING_OFF = {}  # model name -> the thinking type that turns thinking off on that model


def _anthropic_create(**kwargs):
    """Call Messages with thinking off, so a model that thinks by default does not spend max_tokens on it.

    Haiku takes {"type": "disabled"}; Sonnet and Opus 5 refuse that and take {"type": "between_tools"}.
    No temperature: anthropic>=2 rejects it.
    """
    off = _THINKING_OFF.get(kwargs["model"], "disabled")
    try:
        resp = _client("anthropic").messages.create(thinking={"type": off}, **kwargs)
    except Exception as e:
        if off != "disabled" or getattr(e, "status_code", None) != 400 or "thinking" not in str(e):
            raise
        off = "between_tools"
        resp = _client("anthropic").messages.create(thinking={"type": off}, **kwargs)
    _THINKING_OFF[kwargs["model"]] = off
    return resp


def chat(system, messages, max_tokens=500, json_mode=False):
    """Send a system prompt plus a list of {"role", "content"} turns; return the reply text.

    messages alternate "user" / "assistant" and end with a "user" turn.
    """
    name = provider()
    if name not in DEFAULT_MODELS:
        raise LLMError("No LLM configured")
    try:
        if name == "anthropic":
            resp = _anthropic_create(model=model(), max_tokens=max_tokens, system=system, messages=messages)
            return "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
        # openai (or OpenAI-compatible)
        kwargs = {"response_format": {"type": "json_object"}} if json_mode else {}
        resp = _client(name).chat.completions.create(
            model=model(), max_tokens=max_tokens, temperature=0,
            messages=[{"role": "system", "content": system}, *messages],
            **kwargs,
        )
        return resp.choices[0].message.content or ""
    except LLMError:
        raise
    except Exception as e:  # network, auth, rate limit, timeout, bad model name...
        raise LLMError(f"{type(e).__name__}: {e}") from e


def chat_json(system, messages, max_tokens=500):
    """Like chat(), but parse the reply as a JSON object."""
    return parse_json(chat(system, messages, max_tokens, json_mode=True))


def parse_json(text):
    """Pull the first {...} object out of a reply, tolerating ```json fences."""
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        raise LLMError(f"No JSON object in reply: {text[:120]!r}")
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError as e:
        raise LLMError(f"Invalid JSON: {e}") from e
    if not isinstance(data, dict):
        raise LLMError("JSON reply is not an object")
    return data
