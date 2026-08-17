# 一覧は GSI1 の Query で取得する（Scan は使用しない）。

resource "aws_dynamodb_table" "videos" {
  name         = "${local.name_prefix}-videos"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "gsi1pk"
    type = "S"
  }

  # = createdAt (ISO8601 UTC)
  attribute {
    name = "gsi1sk"
    type = "S"
  }

  global_secondary_index {
    name = "GSI1"

    key_schema {
      attribute_name = "gsi1pk"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "gsi1sk"
      key_type       = "RANGE"
    }

    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}
