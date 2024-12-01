import time

# a simpler and basic decorator
def record_it(function):
   def wrap(*args, **kwargs):
      start_time = time.time()
      function_return = function(*args, **kwargs)
      end_time = time.time()
      print(f'run time {int((end_time - start_time) * 1000)}ms')
      return function_return
   return wrap


# a bit extended detailed decorator
def timeit(method):
   def wrap(*args, **kwargs):
      start_time = time.time()
      result = method(*args, **kwargs)
      end_time = time.time()
      if 'log_time' in kwargs:
         name = kwargs.get('log_name', method.__name__.upper())
         kwargs['log_time'][name] = int((end_time - start_time) * 1000)
      else:
         print('%r  %2.22fms' % (method.__name__, (end_time - start_time) * 1000))
      return result
   return wrap


@record_it
def test_basic():
    for _ in range(100):
      time.sleep(0.001)

@timeit
def test():
    for _ in range(100):
      time.sleep(0.001)


test_basic()
test()