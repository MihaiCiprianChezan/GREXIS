from mcp.server import Server
from mcp.types import Tool, TextContent

server = Server("grexis")

FAILURE_SIG_SCHEMA = {
    "type": "object",
    "properties": {
        "error_type": {"type": "string"},
        "error_code": {"type": "string"},
        "tool_name": {"type": "string"},
        "operation": {"type": "string"},
        "severity": {"type": "string", "enum": ["blocking", "degraded", "cosmetic"]},
        "details": {"type": "string"},
    },
    "required": ["error_type"],
}

ENV_SCHEMA = {
    "type": "object",
    "properties": {
        "llm": {"type": "string"},
        "framework": {"type": "string"},
        "framework_version": {"type": "string"},
        "runtime": {"type": "string"},
    },
    "required": ["llm", "framework", "framework_version", "runtime"],
}


@server.list_tools()
async def list_tools() -> list[Tool]:
    return get_mcp_tools()


def get_mcp_tools() -> list[Tool]:
    return [
        Tool(
            name="query_solutions",
            description="Search for solutions to a failure signature in the GREXIS resolution graph",
            inputSchema={
                "type": "object",
                "properties": {
                    "failure_signature": FAILURE_SIG_SCHEMA,
                    "execution_context": {"type": "object"},
                    "goal_state": {"type": "string"},
                    "environment": ENV_SCHEMA,
                    "agent_token": {"type": "string"},
                    "cross_framework": {"type": "boolean", "default": False},
                },
                "required": ["failure_signature", "goal_state", "environment"],
            },
        ),
        Tool(
            name="submit_problem",
            description="Submit a new problem that an agent encountered",
            inputSchema={
                "type": "object",
                "properties": {
                    "failure_signature": FAILURE_SIG_SCHEMA,
                    "execution_context": {"type": "object"},
                    "goal_state": {"type": "string"},
                    "environment": ENV_SCHEMA,
                    "agent_token": {"type": "string"},
                },
                "required": ["failure_signature", "goal_state", "environment"],
            },
        ),
        Tool(
            name="submit_solution",
            description="Submit a solution that resolved a problem",
            inputSchema={
                "type": "object",
                "properties": {
                    "problem": {
                        "type": "object",
                        "properties": {
                            "failure_signature": FAILURE_SIG_SCHEMA,
                            "goal_state": {"type": "string"},
                            "environment": ENV_SCHEMA,
                        },
                        "required": ["failure_signature", "goal_state", "environment"],
                    },
                    "resolution": {
                        "type": "object",
                        "properties": {
                            "solution_steps": {"type": "array", "items": {"type": "string"}},
                            "solution_summary": {"type": "string"},
                            "confidence": {"type": "string", "enum": ["empirical", "inferred"]},
                            "attempts_before_success": {"type": "integer"},
                            "time_to_resolution_ms": {"type": "integer"},
                        },
                        "required": ["solution_steps", "solution_summary", "confidence"],
                    },
                    "agent_token": {"type": "string"},
                    "session_id": {"type": "string"},
                },
                "required": ["problem", "resolution"],
            },
        ),
        Tool(
            name="submit_feedback",
            description="Submit feedback on whether a solution worked",
            inputSchema={
                "type": "object",
                "properties": {
                    "solution_id": {"type": "string", "format": "uuid"},
                    "outcome": {"type": "string", "enum": ["success", "failure", "partial"]},
                    "comment": {"type": "string"},
                    "environment": ENV_SCHEMA,
                    "agent_token": {"type": "string"},
                },
                "required": ["solution_id", "outcome", "environment"],
            },
        ),
        Tool(
            name="register_agent",
            description="Register an agent token with metadata for higher rate limits",
            inputSchema={
                "type": "object",
                "properties": {
                    "agent_token": {"type": "string"},
                    "agent_description": {"type": "string"},
                    "human_operator_email": {"type": "string"},
                    "framework": {"type": "string"},
                },
                "required": ["agent_token"],
            },
        ),
    ]
