from grexis.services.duplicates import build_duplicate_filter


def test_build_duplicate_filter():
    filter_dict = build_duplicate_filter(framework="langchain", error_type="RateLimitError")
    assert filter_dict["must"][0]["key"] == "framework"
    assert filter_dict["must"][1]["key"] == "error_type"
    assert filter_dict["must"][2]["key"] == "status"
