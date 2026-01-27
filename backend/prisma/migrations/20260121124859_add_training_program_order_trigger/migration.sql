-- Функция для автоматического вычисления order при INSERT
CREATE OR REPLACE FUNCTION set_training_program_order_on_insert()
RETURNS TRIGGER AS $$
DECLARE
  max_order INTEGER;
BEGIN
  -- Если order не указан или равен 0, вычисляем автоматически
  IF NEW."order" IS NULL OR NEW."order" = 0 THEN
    -- Находим максимальный order среди программ с тем же parentId
    SELECT COALESCE(MAX("order"), -1) INTO max_order
    FROM "TrainingProgram"
    WHERE "parentId" IS NOT DISTINCT FROM NEW."parentId";
    
    -- Устанавливаем order как максимальный + 1
    NEW."order" := max_order + 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Функция для автоматического пересчета order при UPDATE (если изменился parentId)
CREATE OR REPLACE FUNCTION set_training_program_order_on_update()
RETURNS TRIGGER AS $$
DECLARE
  max_order INTEGER;
BEGIN
  -- Если parentId изменился, пересчитываем order
  IF OLD."parentId" IS DISTINCT FROM NEW."parentId" THEN
    -- Находим максимальный order среди программ с новым parentId (исключая текущую запись)
    SELECT COALESCE(MAX("order"), -1) INTO max_order
    FROM "TrainingProgram"
    WHERE "parentId" IS NOT DISTINCT FROM NEW."parentId"
      AND "id" != NEW."id";
    
    -- Устанавливаем order как максимальный + 1
    NEW."order" := max_order + 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Создаем триггер для INSERT
DROP TRIGGER IF EXISTS training_program_order_insert_trigger ON "TrainingProgram";
CREATE TRIGGER training_program_order_insert_trigger
  BEFORE INSERT ON "TrainingProgram"
  FOR EACH ROW
  EXECUTE FUNCTION set_training_program_order_on_insert();

-- Создаем триггер для UPDATE
DROP TRIGGER IF EXISTS training_program_order_update_trigger ON "TrainingProgram";
CREATE TRIGGER training_program_order_update_trigger
  BEFORE UPDATE ON "TrainingProgram"
  FOR EACH ROW
  EXECUTE FUNCTION set_training_program_order_on_update();
