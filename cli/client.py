"""GREXIS test client -- wraps MCP tool calls via SSE transport."""
import asyncio
import json
import logging
import httpx

logger = logging.getLogger(__name__)


class GrexisClient:
    """Direct HTTP client for testing GREXIS.

    Uses the admin REST API for verification and a simplified MCP call
    approach via direct tool invocation through a test endpoint.
    """

    def __init__(self, base_url: str, admin_secret: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.admin_secret = admin_secret
        self.http = httpx.AsyncClient(base_url=self.base_url, timeout=30.0)
        self._admin_cookie: str | None = None

    async def close(self):
        await self.http.aclose()

    async def admin_login(self):
        """Login to admin dashboard for verification queries."""
        if not self.admin_secret:
            return
        resp = await self.http.post("/auth/login", json={"secret": self.admin_secret})
        resp.raise_for_status()
        self._admin_cookie = resp.cookies.get("grexis_admin_session")

    @property
    def _admin_headers(self) -> dict:
        if self._admin_cookie:
            return {"Cookie": f"grexis_admin_session={self._admin_cookie}"}
        return {}

    async def health(self) -> dict:
        resp = await self.http.get("/health")
        resp.raise_for_status()
        return resp.json()

    async def ready(self) -> dict:
        resp = await self.http.get("/ready")
        return resp.json()

    # --- Admin API calls for verification ---

    async def admin_get_solution(self, solution_id: str) -> dict:
        resp = await self.http.get(
            f"/admin/solutions/{solution_id}", headers=self._admin_headers
        )
        resp.raise_for_status()
        return resp.json()

    async def admin_get_problem(self, problem_id: str) -> dict:
        resp = await self.http.get(
            f"/admin/problems/{problem_id}", headers=self._admin_headers
        )
        resp.raise_for_status()
        return resp.json()

    async def admin_list_solutions(self, **params) -> dict:
        resp = await self.http.get(
            "/admin/solutions", params=params, headers=self._admin_headers
        )
        resp.raise_for_status()
        return resp.json()

    async def admin_ban_token(self, token_hash: str, reason: str) -> dict:
        resp = await self.http.post(
            f"/admin/tokens/{token_hash}/ban",
            json={"reason": reason},
            headers=self._admin_headers,
        )
        resp.raise_for_status()
        return resp.json()

    async def admin_unban_token(self, token_hash: str, reason: str) -> dict:
        resp = await self.http.post(
            f"/admin/tokens/{token_hash}/unban",
            json={"reason": reason},
            headers=self._admin_headers,
        )
        resp.raise_for_status()
        return resp.json()

    async def admin_get_metrics(self) -> dict:
        resp = await self.http.get("/admin/metrics", headers=self._admin_headers)
        resp.raise_for_status()
        return resp.json()

    # --- MCP Tool calls via SSE ---
    # For simplicity, we use the mcp Python SDK's SSE client

    async def call_mcp_tool(self, tool_name: str, arguments: dict) -> dict:
        """Call an MCP tool via the SSE transport.

        Uses httpx-sse to establish SSE connection and send tool call.
        Falls back to a direct POST approach if SSE is not available.
        """
        try:
            from mcp import ClientSession
            from mcp.client.sse import sse_client

            async with sse_client(f"{self.base_url}/mcp/sse") as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    result = await session.call_tool(tool_name, arguments)
                    # Result is a list of TextContent
                    if result.content and len(result.content) > 0:
                        text = result.content[0].text
                        return json.loads(text)
                    return {}
        except ImportError:
            logger.warning("mcp SDK not available, cannot call MCP tools")
            raise RuntimeError(
                "mcp SDK required for tool calls. Install with: pip install mcp"
            )

    # --- Convenience wrappers ---

    async def register_agent(
        self,
        token: str,
        description: str = "Test agent",
        email: str | None = None,
        framework: str | None = None,
    ) -> dict:
        return await self.call_mcp_tool(
            "register_agent",
            {
                "agent_token": token,
                "agent_description": description,
                "human_operator_email": email,
                "framework": framework,
            },
        )

    async def submit_problem(
        self,
        token: str | None,
        failure_signature: dict,
        environment: dict,
        goal_state: str,
        execution_context: dict | None = None,
    ) -> dict:
        args = {
            "failure_signature": failure_signature,
            "environment": environment,
            "goal_state": goal_state,
        }
        if token:
            args["agent_token"] = token
        if execution_context:
            args["execution_context"] = execution_context
        return await self.call_mcp_tool("submit_problem", args)

    async def submit_solution(
        self,
        token: str | None,
        problem: dict,
        resolution: dict,
        session_id: str | None = None,
    ) -> dict:
        args = {
            "problem": problem,
            "resolution": resolution,
        }
        if token:
            args["agent_token"] = token
        if session_id:
            args["session_id"] = session_id
        return await self.call_mcp_tool("submit_solution", args)

    async def query_solutions(
        self,
        token: str | None,
        failure_signature: dict,
        environment: dict,
        goal_state: str,
        cross_framework: bool = False,
    ) -> list[dict]:
        args = {
            "failure_signature": failure_signature,
            "environment": environment,
            "goal_state": goal_state,
            "cross_framework": cross_framework,
        }
        if token:
            args["agent_token"] = token
        return await self.call_mcp_tool("query_solutions", args)

    async def submit_feedback(
        self,
        token: str | None,
        solution_id: str,
        outcome: str,
        environment: dict,
        comment: str | None = None,
    ) -> dict:
        args = {
            "solution_id": solution_id,
            "outcome": outcome,
            "environment": environment,
        }
        if token:
            args["agent_token"] = token
        if comment:
            args["comment"] = comment
        return await self.call_mcp_tool("submit_feedback", args)
